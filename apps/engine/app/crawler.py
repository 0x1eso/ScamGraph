"""
설명 가능한 규칙 엔진 (AI 아님).

- quick_assess(): 네트워크 없이 즉시 위험도 산출 → 데모에서 항상 즉답 (demo-safe)
- crawl_and_enrich(): 실제 네트워크로 리다이렉트/WHOIS/DNS/TLS/콘텐츠 수집 (best-effort)
- score_enrichment(): 수집 신호(도메인 나이·리다이렉트·인증정보 폼·TLS)를 점수에 반영
"""
from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urlparse

import tldextract

from .signals import (
    confusable_skeleton,
    decode_idna,
    has_double_encoding,
    ip_representation,
    is_confusable_host,
    is_shortener,
    nonstandard_port,
)

# eTLD+1 추출기. suffix_list_urls=() + cache_dir=None 으로 네트워크·디스크 접근을 차단하고
# 패키지 번들 스냅샷만 사용한다 → quick_assess 는 절대 네트워크를 호출하지 않는다(demo-safe).
_EXTRACT = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)

# 타이포스쿼팅 비교 대상 (국내외 주요 브랜드/기관)
KNOWN_BRANDS = [
    "google", "naver", "kakao", "kakaobank", "toss", "kbstar", "shinhan", "woori",
    "nonghyup", "coupang", "apple", "paypal", "amazon", "facebook",
    "instagram", "netflix", "samsung", "hana", "ibk", "kbank", "sc", "epost",
]

SUSPICIOUS_TLDS = {
    "zip", "mov", "top", "xyz", "click", "country", "gq", "tk", "ml",
    "cf", "ga", "work", "rest", "fit", "loan", "men", "cyou", "sbs", "quest",
}

# 피싱 URL에 자주 쓰이는 유도 키워드 (어휘 기반 신호) — 한국형 스미싱/보이스피싱 포함
PHISH_KEYWORDS = {
    # 일반 피싱
    "secure", "login", "signin", "verify", "otp", "update", "account", "confirm",
    "auth", "support", "alert", "unlock", "webmail", "customer", "password", "wallet",
    # 배송/택배 사칭
    "delivery", "track", "parcel", "post", "cj", "logistics", "shipment",
    # 금융/결제 사칭
    "pay", "refund", "card", "bank", "safe", "transfer", "won", "settlement",
    # 공공/수사기관 사칭
    "gov", "police", "court", "prosecutor", "customs", "tax", "notice", "fine",
    # 미끼(정부지원금·당첨·이벤트)
    "benefit", "subsidy", "relief", "support-fund", "reward", "prize", "event",
    "gift", "coupon", "lotto", "invest", "coin",
    # 긴급 유도
    "urgent", "check", "cancel", "block", "warning", "expired",
}

# 정상 도메인 화이트리스트 — 오탐(false positive) 방지. 신뢰의 핵심.
# 이 도메인(또는 하위 도메인)은 규칙에 걸려도 안전으로 판정한다.
ALLOWLIST = {
    "naver.com", "naver.me", "navercorp.com", "kakao.com", "kakaocorp.com",
    "daum.net", "google.com", "youtube.com", "gmail.com", "apple.com",
    "microsoft.com", "samsung.com", "coupang.com", "toss.im", "tossbank.com",
    "kbstar.com", "kbfg.com", "shinhan.com", "shinhancard.com", "wooribank.com",
    "nonghyup.com", "nhbank.com", "ibk.co.kr", "hanabank.com", "kebhana.com",
    "kakaobank.com", "gov.kr", "korea.kr", "go.kr", "police.go.kr", "fss.or.kr",
    "kisa.or.kr", "11st.co.kr", "gmarket.co.kr", "baemin.com",
}


def _grade(score: int) -> str:
    if score >= 70:
        return "danger"
    if score >= 35:
        return "warning"
    if score >= 15:
        return "caution"
    return "safe"


def _levenshtein(a: str, b: str) -> int:
    """순수 파이썬 편집 거리 — 타이포스쿼팅 탐지용."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def classify_target(target: str) -> str:
    """입력을 URL / PHONE / ACCOUNT 로 분류."""
    t = target.strip()
    digits = re.sub(r"\D", "", t)
    if re.search(r"[a-zA-Z]", t) or "." in t or "/" in t:
        return "url"
    if 9 <= len(digits) <= 11:
        return "phone"
    if 10 <= len(digits) <= 16:
        return "account"
    return "url"


def _host_of(target: str) -> str:
    t = target if "://" in target else f"http://{target}"
    return (urlparse(t).hostname or "").lower()


def _is_allowlisted(host: str) -> bool:
    """정상 도메인(또는 그 하위 도메인)인지 — 오탐 방지."""
    if not host:
        return False
    return any(host == d or host.endswith("." + d) for d in ALLOWLIST)


# 혼동 문자(homoglyph) 탐지 — 라틴 알파벳처럼 보이는 키릴/그리스/전각 문자로 정상 도메인 위장.
# 예: 'nаver.com'의 'а'(U+0430 키릴). 퓨니코드(xn--)는 디코드 후 스켈레톤으로 검사한다.
# 상세 구현은 app.signals.confusables 참조.
def _has_confusable(host: str) -> bool:
    return is_confusable_host(host)


def _registrable(host: str) -> tuple[str, str, str, str]:
    """(subdomain, domain, suffix, registered_domain) 반환.

    tldextract 로 멀티파트 TLD(co.kr·go.kr·com.au 등)까지 정확히 분해한다.
    실패 시 labels[-2] 근사치로 폴백해 quick_assess 가 절대 예외를 던지지 않게 한다.
    """
    try:
        ext = _EXTRACT(host)
        if ext.suffix and ext.domain:
            return ext.subdomain, ext.domain, ext.suffix, ext.registered_domain
    except Exception:  # noqa: BLE001 — 폴백
        pass
    labels = host.split(".") if host else []
    if len(labels) >= 2:
        return ".".join(labels[:-2]), labels[-2], labels[-1], ".".join(labels[-2:])
    return "", host, "", host


def _tokens(text: str) -> list[str]:
    """도메인 이름 부분을 하이픈/언더스코어/점 단위 영숫자 토큰으로 분해(길이 3+)."""
    return [t for t in re.split(r"[.\-_]", text) if t.isalnum() and len(t) >= 3]


def _brand_hit(tokens: list[str], registered_name: str):
    """등록 도메인 토큰에서 브랜드 사칭/타이포스쿼팅을 탐지."""
    for tok in tokens:
        for brand in KNOWN_BRANDS:
            d = _levenshtein(tok, brand)
            if d == 0 and registered_name != brand:
                return ("impersonation", brand, tok, 0)
            # 타이포스쿼팅: 4자 이상 토큰만 — 3자 토큰이 4자 브랜드와 거리 1로 오탐하는 것 방지
            # (예: 'han' ≈ 'hana' 오탐 차단). 거리 2는 6자 이상 긴 브랜드에만 허용해
            # 짧은 브랜드가 무관한 단어(예: 'canva')와 거리 2로 오탐하는 것을 막는다.
            if (0 < d <= 2 and len(tok) >= 4 and len(brand) >= 4
                    and abs(len(tok) - len(brand)) <= 2
                    and (d == 1 or len(brand) >= 6)):
                return ("typosquatting", brand, tok, d)
            # 브랜드명이 토큰에 임베드(예: 'tosspay' ⊃ 'toss', 'shinhancard' ⊃ 'shinhan')
            if (len(brand) >= 4 and brand in tok and tok != brand
                    and registered_name != brand and len(tok) <= len(brand) + 10):
                return ("impersonation", brand, tok, 0)
    return None


def _brand_in_subdomain(sub_tokens: list[str]):
    """서브도메인 토큰에만 브랜드가 있는지(등록 도메인은 무관) — 브랜드-서브도메인 위장."""
    for tok in sub_tokens:
        for brand in KNOWN_BRANDS:
            if tok == brand or (len(brand) >= 4 and brand in tok):
                return (brand, tok)
    return None


def quick_assess(target: str) -> dict:
    """네트워크 없이 규칙 기반 위험 평가. 각 규칙은 (점수, 근거)를 남긴다."""
    target = target.strip()
    kind = classify_target(target)
    reasons: list[dict] = []
    score = 0

    if kind == "url":
        host = _host_of(target)

        # 정상 도메인 화이트리스트 → 오탐 방지 (즉시 안전 판정).
        # 반드시 *원본 호스트*로 검사한다: 혼동문자로 위장한 'nаver.com'(키릴)은
        # 스켈레톤이 'naver.com'이라도 화이트리스트를 통과하면 안 된다.
        if _is_allowlisted(host):
            return {"kind": kind, "risk_score": 0, "grade": "safe",
                    "reasons": [{"rule": "verified_domain", "weight": 0,
                                 "detail": "알려진 정상 도메인 (검증된 화이트리스트)"}]}

        # 혼동/혼합 문자를 ASCII 스켈레톤으로 접어 토큰·브랜드 분석을 견고하게 한다
        # (퓨니코드는 먼저 유니코드로 디코드). 비ASCII 위장이 없으면 skeleton == host.
        decoded = decode_idna(host)
        skeleton = confusable_skeleton(decoded)
        analysis_host = skeleton or host

        sub, reg_name, suffix, reg_domain = _registrable(analysis_host)
        labels = analysis_host.split(".") if analysis_host else []
        name_part = (sub + "." + reg_name).strip(".") if reg_name else analysis_host
        tokens = _tokens(name_part)

        # 퓨니코드(xn--) 사용 자체가 유명 브랜드 위장 신호
        if host.startswith("xn--") or ".xn--" in host:
            score += 35
            reasons.append({"rule": "homograph", "weight": 35, "confidence": 0.7,
                            "detail": "퓨니코드(xn--) 도메인 — 유명 브랜드 위장 가능성"})

        # 혼동 문자(키릴/그리스/전각)·혼합 스크립트로 정상 도메인 위장 — 거의 확실한 악성.
        # 스켈레톤이 화이트리스트와 일치하면 특정 브랜드를 노린 표적 위장 → 가중치 상향.
        if _has_confusable(host):
            mimics = _is_allowlisted(skeleton)
            w = 50 if mimics else 40
            score += w
            detail = (f"혼동/혼합 문자로 정상 도메인('{skeleton}') 위장 — 표적 피싱"
                      if mimics else "혼동 문자·혼합 스크립트로 도메인 위장")
            reasons.append({"rule": "homoglyph", "weight": w,
                            "confidence": 0.97 if mimics else 0.9, "detail": detail})

        # 브랜드 사칭 — 등록 도메인 이름을 우선 검사(정확일치·임베드·타이포스쿼팅)
        hit = _brand_hit(_tokens(reg_name), reg_name)
        if hit:
            hit_type, brand, tok, d = hit
            if hit_type == "impersonation":
                score += 35
                reasons.append({"rule": "brand_impersonation", "weight": 35,
                                "confidence": 0.8,
                                "detail": f"'{brand}' 브랜드명이 도메인에 포함되나 공식 도메인이 아님"})
            else:
                score += 38
                reasons.append({"rule": "typosquatting", "weight": 38, "confidence": 0.85,
                                "detail": f"'{tok}' ≈ '{brand}' (편집거리 {d}) — 유사 도메인 위장"})
        else:
            # 등록 도메인엔 없고 서브도메인에만 브랜드 → 실제 목적지는 다른 등록 도메인
            sub_hit = _brand_in_subdomain(_tokens(sub))
            if sub_hit:
                brand, tok = sub_hit
                score += 30
                reasons.append({"rule": "brand_subdomain", "weight": 30, "confidence": 0.8,
                                "detail": f"'{brand}' 브랜드가 서브도메인에만 있고 실제 등록 "
                                          f"도메인은 '{reg_domain}' — 목적지 위장"})

        tld = labels[-1] if labels else ""
        if tld in SUSPICIOUS_TLDS:
            score += 22
            reasons.append({"rule": "suspicious_tld", "weight": 22,
                            "detail": f"위험 TLD '.{tld}'"})

        # 피싱 유도 키워드
        kw_hits = [tok for tok in tokens if tok in PHISH_KEYWORDS]
        if kw_hits:
            w = min(16 + (len(kw_hits) - 1) * 8, 30)
            score += w
            reasons.append({"rule": "phishing_keywords", "weight": w,
                            "detail": "피싱 유도 키워드: " + ", ".join(kw_hits)})

        # 숫자 과다 (정상 도메인은 숫자를 거의 안 씀)
        digit_count = sum(c.isdigit() for c in name_part)
        if digit_count >= 4:
            score += 10
            reasons.append({"rule": "digit_heavy", "weight": 10,
                            "detail": f"도메인에 숫자 과다({digit_count}) — 자동 생성 흔적"})

        # 하이픈 과다 (여러 키워드를 이어붙인 위장 도메인)
        hyphen_count = name_part.count("-")
        if hyphen_count >= 3:
            score += 10
            reasons.append({"rule": "hyphen_heavy", "weight": 10,
                            "detail": f"하이픈 과다({hyphen_count}) — 키워드 조합 위장"})

        # IP 주소 표기 — 점10진(ip_host) 또는 정수/16진 인코딩(obfuscated_ip)
        ip_form = ip_representation(host)
        if ip_form == "dotted":
            score += 30
            reasons.append({"rule": "ip_host", "weight": 30, "confidence": 0.85,
                            "detail": "도메인 대신 IP 주소 사용"})
        elif ip_form in ("decimal", "hex"):
            score += 30
            reasons.append({"rule": "obfuscated_ip", "weight": 30, "confidence": 0.9,
                            "detail": f"IP 주소를 {ip_form}로 인코딩 — 목적지 은폐"})

        # 알려진 URL 단축 서비스 — 실제 목적지를 감춘다(양날의 검이라 가중치는 보수적)
        if is_shortener(reg_domain, host):
            score += 20
            reasons.append({"rule": "url_shortener", "weight": 20, "confidence": 0.5,
                            "detail": f"URL 단축 서비스({reg_domain}) — 실제 목적지 은폐"})

        if "@" in target:
            score += 25
            reasons.append({"rule": "at_symbol", "weight": 25, "confidence": 0.7,
                            "detail": "URL 내 '@' — 실제 목적지 은폐 기법"})

        # 이중/중첩 퍼센트 인코딩 — 필터 우회·목적지 은폐
        if has_double_encoding(target):
            score += 18
            reasons.append({"rule": "double_encoding", "weight": 18, "confidence": 0.7,
                            "detail": "이중 URL 인코딩(%25XX) — 필터 우회 시도"})

        # 비표준 포트 — 정상 서비스는 80/443 사용
        port = nonstandard_port(target)
        if port is not None:
            score += 12
            reasons.append({"rule": "nonstandard_port", "weight": 12, "confidence": 0.45,
                            "detail": f"비표준 포트(:{port}) 사용"})

        if len(labels) >= 5:
            score += 15
            reasons.append({"rule": "deep_subdomain", "weight": 15,
                            "detail": f"과도한 서브도메인 깊이({len(labels)})"})

        if len(target) >= 75:
            score += 10
            reasons.append({"rule": "long_url", "weight": 10,
                            "detail": "비정상적으로 긴 URL"})

        if "://" in target and not target.lower().startswith("https"):
            score += 8
            reasons.append({"rule": "no_tls", "weight": 8,
                            "detail": "HTTPS 미사용"})

    elif kind == "phone":
        digits = re.sub(r"\D", "", target)
        if digits.startswith(("070", "050")):
            score += 20
            reasons.append({"rule": "voip_prefix", "weight": 20,
                            "detail": "인터넷전화(070/050) 번호 — 발신 위장에 자주 사용"})
        # 국제전화: 원본의 선행 '+' 또는 국제 접속번호 '00' (digits 에선 '+'가 제거되므로 원본도 확인)
        if target.strip().startswith("+") or digits.startswith("00"):
            score += 15
            reasons.append({"rule": "intl_prefix", "weight": 15,
                            "detail": "국제전화 발신"})

    elif kind == "account":
        reasons.append({"rule": "account_lookup", "weight": 0,
                        "detail": "커뮤니티 신고 DB 대조 필요"})

    score = min(score, 100)
    return {"kind": kind, "risk_score": score, "grade": _grade(score), "reasons": reasons}


def crawl_and_enrich(target: str) -> dict:
    """실제 네트워크 수집 (best-effort). 그래프 적재/스코어링용 인프라 정보를 반환."""
    result = quick_assess(target)
    result["target"] = target
    enrich: dict = {}

    if result["kind"] == "url":
        host = _host_of(target)
        enrich["host"] = host

        # 리다이렉트 체인 + 최종 목적지 + 페이지 콘텐츠(인증정보 폼 탐지)
        try:
            import httpx
            url = target if "://" in target else f"http://{target}"
            with httpx.Client(timeout=6.0, follow_redirects=True) as client:
                resp = client.get(url)
                enrich["final_url"] = str(resp.url)
                enrich["status_code"] = resp.status_code
                enrich["redirects"] = [str(h.url) for h in resp.history]
                enrich["content"] = _analyze_content(resp.text, host)
        except Exception as e:  # noqa: BLE001
            enrich["fetch_error"] = str(e)

        # WHOIS: 도메인 생성일 + 등록자 (귀속 pivot)
        try:
            import whois  # python-whois
            w = whois.whois(host)
            created = w.creation_date
            if isinstance(created, list):
                created = created[0] if created else None
            enrich["created"] = created.isoformat() if hasattr(created, "isoformat") else (
                str(created) if created else None)
            registrant = w.get("org") or w.get("registrant_name") or w.get("name")
            enrich["registrant"] = str(registrant) if registrant else None
        except Exception as e:  # noqa: BLE001
            enrich["whois_error"] = str(e)

        # DNS A 레코드
        try:
            import dns.resolver
            answers = dns.resolver.resolve(host, "A", lifetime=5.0)
            enrich["ips"] = [r.to_text() for r in answers]
        except Exception as e:  # noqa: BLE001
            enrich["dns_error"] = str(e)

        # TLS 인증서 (발급자·유효기간·지문 → 귀속 pivot)
        enrich["tls"] = _inspect_tls(host)

    result["enrichment"] = enrich
    return result


def score_enrichment(result: dict) -> dict:
    """수집 신호를 점수에 반영. crawl_and_enrich 이후 워커에서 호출."""
    enrich = result.get("enrichment", {})
    reasons = result.get("reasons", [])
    added = 0

    # 도메인 나이 — created 는 crawl_and_enrich 가 항상 ISO 문자열(또는 None)로 채운다.
    # 방어적으로 문자열만 파싱한다(비문자열이면 조용히 건너뜀 → 예외를 흐름제어로 쓰지 않음).
    created = enrich.get("created")
    if isinstance(created, str) and created:
        try:
            raw = created.replace("Z", "").split("+")[0].split(".")[0].strip()
            dt = datetime.fromisoformat(raw)
            age_days = (datetime.utcnow() - dt).days
            if 0 <= age_days < 30:
                added += 25
                reasons.append({"rule": "newly_registered", "weight": 25,
                                "detail": f"신생 도메인 — {age_days}일 전 등록"})
            elif age_days < 90:
                added += 12
                reasons.append({"rule": "recent_domain", "weight": 12,
                                "detail": f"최근 등록 도메인 — {age_days}일 전"})
        except Exception:  # noqa: BLE001
            pass

    # 리다이렉트 체인
    redirects = enrich.get("redirects") or []
    if len(redirects) >= 2:
        added += 12
        reasons.append({"rule": "redirect_chain", "weight": 12,
                        "detail": f"리다이렉트 {len(redirects)}회 — 목적지 은폐"})

    # 콘텐츠: 인증정보 입력 폼
    content = enrich.get("content") or {}
    if content.get("has_password_input"):
        added += 20
        reasons.append({"rule": "credential_form", "weight": 20,
                        "detail": "비밀번호 입력 폼 감지 — 피싱 페이지 특징"})
    if content.get("has_otp"):
        added += 22
        reasons.append({"rule": "otp_form", "weight": 22,
                        "detail": "인증번호(OTP)/보안카드 요구 감지"})
    if content.get("external_form"):
        added += 15
        reasons.append({"rule": "external_form", "weight": 15,
                        "detail": "입력값을 외부 도메인으로 전송"})

    # TLS
    tls = enrich.get("tls") or {}
    if tls.get("error"):
        added += 12
        reasons.append({"rule": "tls_invalid", "weight": 12,
                        "detail": "TLS 인증서 검증 실패(자가서명/만료 등)"})
    elif tls.get("not_before"):
        try:
            import ssl as _ssl
            cert_age = (datetime.utcnow().timestamp()
                        - _ssl.cert_time_to_seconds(tls["not_before"])) / 86400
            if 0 <= cert_age < 14:
                added += 10
                reasons.append({"rule": "new_cert", "weight": 10,
                                "detail": f"신생 TLS 인증서 — {int(cert_age)}일 전 발급"})
        except Exception:  # noqa: BLE001
            pass

    if added:
        result["risk_score"] = min(result.get("risk_score", 0) + added, 100)
        result["grade"] = _grade(result["risk_score"])
    return result


def _analyze_content(html: str, host: str) -> dict:
    """페이지 HTML에서 피싱 특징(인증정보 폼)을 탐지."""
    out = {"has_password_input": False, "has_otp": False, "external_form": False}
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        out["has_password_input"] = bool(soup.find("input", {"type": "password"}))
        low = html.lower()
        out["has_otp"] = any(k in low for k in (
            "otp", "인증번호", "one-time", "verification code", "보안카드", "보안코드"))
        for form in soup.find_all("form"):
            action = str(form.get("action") or "")
            if action.startswith("http") and host and host not in action:
                out["external_form"] = True
                break
    except Exception:  # noqa: BLE001
        pass
    return out


def _inspect_tls(host: str) -> dict:
    """TLS 인증서 발급자·유효기간·지문 수집 (검증 실패도 신호)."""
    import hashlib
    import socket
    import ssl
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=5) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
                der = ssock.getpeercert(binary_form=True)
                issuer = ""
                for part in cert.get("issuer", ()):
                    for k, v in part:
                        if k in ("organizationName", "commonName"):
                            issuer = v
                return {
                    "issuer": issuer,
                    "not_before": cert.get("notBefore"),
                    "not_after": cert.get("notAfter"),
                    "fingerprint": hashlib.sha256(der).hexdigest()[:16] if der else None,
                }
    except ssl.SSLCertVerificationError as e:
        return {"error": "cert_verify_failed", "detail": str(e)}
    except Exception as e:  # noqa: BLE001
        return {"error": "tls_unreachable", "detail": str(e)}

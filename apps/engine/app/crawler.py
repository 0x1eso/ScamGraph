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


def quick_assess(target: str) -> dict:
    """네트워크 없이 규칙 기반 위험 평가. 각 규칙은 (점수, 근거)를 남긴다."""
    target = target.strip()
    kind = classify_target(target)
    reasons: list[dict] = []
    score = 0

    if kind == "url":
        host = _host_of(target)
        labels = host.split(".") if host else []
        registered = labels[-2] if len(labels) >= 2 else host
        # TLD를 제외한 도메인 이름 부분을 하이픈/언더스코어/점 단위 토큰으로 분해
        name_part = ".".join(labels[:-1]) if len(labels) >= 2 else host
        tokens = [tok for tok in re.split(r"[.\-_]", name_part)
                  if tok.isalnum() and len(tok) >= 3]

        if host.startswith("xn--") or ".xn--" in host:
            score += 35
            reasons.append({"rule": "homograph", "weight": 35,
                            "detail": "퓨니코드(xn--) 도메인 — 유명 브랜드 위장 가능성"})

        # 브랜드 사칭(정확 일치) / 타이포스쿼팅(편집거리 1~2) — 토큰 단위
        brand_hit = None
        for tok in tokens:
            for brand in KNOWN_BRANDS:
                d = _levenshtein(tok, brand)
                if d == 0 and registered != brand:
                    brand_hit = ("impersonation", brand, tok, d)
                    break
                if 0 < d <= 2 and abs(len(tok) - len(brand)) <= 2:
                    brand_hit = ("typosquatting", brand, tok, d)
                    break
            if brand_hit:
                break
        if brand_hit:
            hit_type, brand, tok, d = brand_hit
            if hit_type == "impersonation":
                score += 35
                reasons.append({"rule": "brand_impersonation", "weight": 35,
                                "detail": f"'{brand}' 브랜드명이 도메인에 포함되나 공식 도메인이 아님"})
            else:
                score += 38
                reasons.append({"rule": "typosquatting", "weight": 38,
                                "detail": f"'{tok}' ≈ '{brand}' (편집거리 {d}) — 유사 도메인 위장"})

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

        if re.fullmatch(r"[0-9.]+", host):
            score += 30
            reasons.append({"rule": "ip_host", "weight": 30,
                            "detail": "도메인 대신 IP 주소 사용"})

        if "@" in target:
            score += 25
            reasons.append({"rule": "at_symbol", "weight": 25,
                            "detail": "URL 내 '@' — 실제 목적지 은폐 기법"})

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
        if digits.startswith(("00", "+")):
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

    # 도메인 나이
    created = enrich.get("created")
    if created:
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

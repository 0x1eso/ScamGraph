"""한국 사칭 감시 대상 브랜드 — CT · URLScan · PhishTank 어댑터 공용.

브랜드명이 도메인에 섞여 있으면서 **공식 도메인이 아닌** 것을 '사칭 후보'로 본다.
CT 는 정상 인증서가 방대하므로 브랜드 + 의심 토큰이 함께 나올 때만 신호로 간주한다.
"""
from __future__ import annotations

# 감시 브랜드 → 공식(정상) 도메인 목록. 공식 도메인은 사칭에서 제외한다.
WATCHED: dict[str, tuple[str, ...]] = {
    "naver": ("naver.com", "naver.net"),
    "toss": ("toss.im", "tossbank.com"),
    "kbstar": ("kbstar.com", "kbfg.com"),
    "shinhan": ("shinhan.com", "shinhancard.com"),
    "kakao": ("kakao.com", "kakaopay.com"),
}

# 도메인에 브랜드와 함께 나타나면 사칭 신호가 강해지는 토큰.
SUSPICIOUS_TOKENS: tuple[str, ...] = (
    "login", "secure", "verify", "otp", "auth", "cert", "help",
    "account", "event", "gift", "refund", "safe", "alert",
    "update", "renew", "confirm", "center", "point", "check",
)


def matched_brand(host: str) -> str | None:
    """host 에 감시 브랜드가 섞여 있고 공식 도메인이 아니면 브랜드명 반환, 아니면 None."""
    h = (host or "").lower()
    if not h:
        return None
    for brand, official in WATCHED.items():
        if brand not in h:
            continue
        if any(h == o or h.endswith("." + o) for o in official):
            return None  # 공식 도메인 → 사칭 아님
        return brand
    return None


def looks_like_impersonation(host: str) -> str | None:
    """브랜드 사칭이면서 의심 토큰까지 포함한 host 만 브랜드명 반환(CT 용 엄격 필터)."""
    brand = matched_brand(host)
    if brand and any(tok in host.lower() for tok in SUSPICIOUS_TOKENS):
        return brand
    return None

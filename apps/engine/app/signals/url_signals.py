"""URL 구조 신호 — 목적지를 은폐하거나 필터를 우회하려는 흔적 탐지.

모두 순수 함수(네트워크 무접촉). quick_assess 가 즉시 호출한다.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

# 알려진 URL 단축 서비스(등록 도메인 기준). 실제 목적지를 감추므로 스캐너 관점에서 주의 신호.
# 국내(han.gl·buly.kr 등) + 글로벌.
SHORTENERS: frozenset[str] = frozenset({
    # 글로벌
    "bit.ly", "tinyurl.com", "is.gd", "t.co", "goo.gl", "ow.ly", "buff.ly",
    "rebrand.ly", "cutt.ly", "rb.gy", "t.ly", "v.gd", "shorturl.at", "bit.do",
    "adf.ly", "tiny.cc", "lnkd.in", "s.id", "u.to", "x.co", "soo.gd",
    "clck.ru", "shrtco.de", "qr.ae", "1link.in", "trib.al",
    # 국내
    "han.gl", "buly.kr", "me2.do", "url.kr", "vo.la", "kko.to", "c11.kr",
    "durl.kr", "muz.so", "abr.ge", "aha.io", "kko.kr",
})

_HEX_HOST = re.compile(r"0x[0-9a-fA-F]+")
_DOTTED_HEX = re.compile(r"(?:0x[0-9a-fA-F]+\.){1,3}0x[0-9a-fA-F]+$")
_DOTTED_DECIMAL = re.compile(r"[0-9]+(?:\.[0-9]+){3}$")
_BIG_DECIMAL = re.compile(r"[0-9]{5,10}$")
_DOUBLE_PCT = re.compile(r"%25[0-9a-fA-F]{2}", re.IGNORECASE)


def _url(target: str) -> str:
    return target if "://" in target else f"http://{target}"


def is_shortener(registered_domain: str, host: str) -> bool:
    """등록 도메인 또는 호스트가 알려진 단축 서비스인지."""
    return registered_domain in SHORTENERS or host in SHORTENERS


def has_double_encoding(target: str) -> bool:
    """이중/중첩 퍼센트 인코딩(%25XX = '%'가 다시 인코딩됨) — 필터 우회·목적지 은폐."""
    return bool(_DOUBLE_PCT.search(target))


def nonstandard_port(target: str) -> int | None:
    """URL 이 80/443 이 아닌 명시적 포트를 쓰면 그 포트 번호를 반환."""
    try:
        port = urlparse(_url(target)).port
    except ValueError:
        return None
    if port is None or port in (80, 443):
        return None
    return port


def ip_representation(host: str) -> str | None:
    """호스트가 IP 주소 표기인지와 그 형태를 반환.

    - "dotted"  : 192.168.0.1 (점 10진)
    - "decimal" : 3626568449  (단일 정수로 인코딩)
    - "hex"     : 0x7f000001 / 0xa9.0xfe.0x0.0x1 (16진)
    아니면 None. 10진/16진 인코딩은 목적지를 감추는 고전적 기법.
    """
    if not host:
        return None
    if _DOTTED_DECIMAL.fullmatch(host):
        return "dotted"
    if _HEX_HOST.fullmatch(host) or _DOTTED_HEX.fullmatch(host):
        return "hex"
    if _BIG_DECIMAL.fullmatch(host):
        try:
            value = int(host)
        except ValueError:
            return None
        if 0 <= value <= 0xFFFFFFFF:
            return "decimal"
    return None

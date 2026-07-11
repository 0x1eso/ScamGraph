"""설명 가능한 규칙 엔진의 보조 신호 모듈.

crawler.quick_assess 가 사용하는 순수 함수(네트워크 무접촉, stdlib + tldextract)를
도메인별로 분리해 담는다.

- confusables: UTS#39 풍 혼동문자 스켈레톤·혼합 스크립트·퓨니코드 디코드
- url_signals: 단축 URL·이중 인코딩·비표준 포트·인코딩된 IP 탐지
"""
from __future__ import annotations

from .confusables import (
    confusable_skeleton,
    decode_idna,
    is_confusable_host,
    is_mixed_script,
)
from .url_signals import (
    SHORTENERS,
    has_double_encoding,
    ip_representation,
    is_shortener,
    nonstandard_port,
)

__all__ = [
    "confusable_skeleton",
    "decode_idna",
    "is_confusable_host",
    "is_mixed_script",
    "SHORTENERS",
    "has_double_encoding",
    "ip_representation",
    "is_shortener",
    "nonstandard_port",
]

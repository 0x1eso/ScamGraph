"""보조 신호 순수 함수 단위 테스트 — confusables · url_signals (네트워크 무접촉)."""
from __future__ import annotations

import pytest

from app.signals import (
    confusable_skeleton,
    decode_idna,
    has_double_encoding,
    ip_representation,
    is_confusable_host,
    is_mixed_script,
    is_shortener,
    nonstandard_port,
)
from app.signals.confusables import _CONFUSABLE_MAP


# ---------------------------------------------------------------------------
# confusables — 혼동문자 스켈레톤/혼합 스크립트/퓨니코드
# ---------------------------------------------------------------------------
def test_confusable_skeleton_folds_cyrillic_greek_fullwidth_and_lowercases():
    assert confusable_skeleton("nаver") == "naver"      # 키릴 а(U+0430)
    assert confusable_skeleton("gοοgle") == "google"    # 그리스 ο(U+03BF)
    assert confusable_skeleton("ｎaver") == "naver"      # 전각 ｎ(U+FF4E)
    assert confusable_skeleton("NAVER") == "naver"      # 소문자화


def test_confusable_skeleton_ascii_is_unchanged():
    assert confusable_skeleton("naver-login.top") == "naver-login.top"


def test_is_mixed_script_latin_plus_confusable_script():
    assert is_mixed_script("paypаl")            # 라틴 + 키릴
    assert is_mixed_script("gοοgle")            # 라틴 + 그리스
    assert not is_mixed_script("naver")         # 라틴 단일
    assert not is_mixed_script("파이썬naver")   # 한글+라틴은 위장 대상 아님(오탐 방지)


def test_decode_idna_roundtrip_and_passthrough():
    assert decode_idna("naver.com") == "naver.com"          # xn-- 없음 → 그대로
    decoded = decode_idna("xn--pple-43d.com")               # → аpple.com (키릴)
    assert decoded.endswith(".com") and decoded != "xn--pple-43d.com"
    assert decode_idna("xn--@@@.com") == "xn--@@@.com"      # 잘못된 라벨은 원본 유지(무예외)


def test_is_confusable_host():
    assert is_confusable_host("nаver.com")            # 키릴 а
    assert is_confusable_host("xn--pple-43d.com")     # 퓨니코드 → 키릴
    assert not is_confusable_host("naver-secure-login.top")  # 순수 ASCII


def test_confusable_map_targets_are_single_ascii():
    # 모든 매핑 대상은 단일 ASCII 문자여야 스켈레톤이 안정적으로 접힌다.
    for dst in _CONFUSABLE_MAP.values():
        assert dst.isascii() and len(dst) == 1


# ---------------------------------------------------------------------------
# url_signals — 단축URL / 이중인코딩 / 비표준포트 / IP 표기
# ---------------------------------------------------------------------------
def test_is_shortener_matches_registered_domain_or_host():
    assert is_shortener("bit.ly", "bit.ly")
    assert is_shortener("han.gl", "han.gl")
    assert is_shortener("example.com", "han.gl")        # host 로도 매칭
    assert not is_shortener("example.com", "example.com")


def test_has_double_encoding():
    assert has_double_encoding("http://x.com/%252e%252e/x")
    assert has_double_encoding("http://x.com/%2531")
    assert not has_double_encoding("http://x.com/%2e%2e/x")   # 단일 인코딩
    assert not has_double_encoding("http://x.com/plain")


@pytest.mark.parametrize(
    "target,expected",
    [
        ("http://x.com:8080/a", 8080),
        ("http://x.com:8443/a", 8443),
        ("http://x.com/a", None),
        ("http://x.com:80/a", None),
        ("https://x.com:443/a", None),
        ("x.com", None),
    ],
)
def test_nonstandard_port(target, expected):
    assert nonstandard_port(target) == expected


@pytest.mark.parametrize(
    "host,expected",
    [
        ("192.168.0.1", "dotted"),
        ("185.220.101.44", "dotted"),
        ("3626568449", "decimal"),
        ("0x7f000001", "hex"),
        ("0xa9.0xfe.0x0.0x1", "hex"),
        ("naver.com", None),
        ("", None),
        ("9999999999", None),   # 10자리지만 > 0xFFFFFFFF → IP 아님
        ("123", None),          # decimal 패턴(5~10자리) 미해당
    ],
)
def test_ip_representation(host, expected):
    assert ip_representation(host) == expected

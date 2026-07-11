"""혼동 문자(homoglyph) 정규화 — UTS#39 스켈레톤의 경량 구현.

정상 도메인은 라틴 알파벳이다. 공격자는 라틴처럼 보이는 키릴/그리스/전각 문자를 섞어
정상 도메인을 위장한다(예: 'nаver.com'의 'а'는 키릴 U+0430).

여기서는 유니코드 confusables 전체 표 대신, 실전에서 자주 쓰이는 룩얼라이크만 손으로
추린 소형 맵을 쓴다(오프라인·설명 가능). 핵심 함수:

- confusable_skeleton(): 비ASCII 룩얼라이크를 ASCII 대응 문자로 접어 "스켈레톤"을 만든다.
  스켈레톤이 원문과 다르면 위장 문자가 섞였다는 뜻이고, 스켈레톤이 정상 도메인/브랜드와
  일치하면 표적 피싱 신호가 된다.
- is_mixed_script(): 라틴 + (키릴|그리스)가 한 호스트에 섞였는지 — 고정밀 위장 신호.
- decode_idna(): 퓨니코드(xn--) 라벨을 원래 유니코드로 되돌려 스켈레톤 분석에 태운다.
"""
from __future__ import annotations

# 비ASCII 룩얼라이크 → ASCII. 강한 시각적 동일성만 포함(오탐 최소화).
_CONFUSABLE_MAP: dict[str, str] = {
    # --- 키릴 소문자 ---
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c",
    "у": "y", "х": "x", "ѕ": "s", "і": "i", "ј": "j",
    "ԁ": "d", "һ": "h", "қ": "k", "к": "k", "м": "m",
    "н": "h", "т": "t", "в": "b", "ґ": "r", "є": "e",
    "ԛ": "q", "ա": "w",
    # --- 키릴 대문자 ---
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M",
    "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T",
    "Х": "X", "У": "Y", "І": "I", "Ј": "J", "Ѕ": "S",
    # --- 그리스 소문자 ---
    "ο": "o", "α": "a", "ν": "v", "ρ": "p", "ι": "i",
    "κ": "k", "τ": "t", "υ": "u", "χ": "x", "ε": "e",
    "ϲ": "c", "γ": "y", "ω": "w", "μ": "u",
    # --- 그리스 대문자 ---
    "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H",
    "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O",
    "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
    # --- 기타 라틴 확장 룩얼라이크 ---
    "ı": "i",  # 점 없는 i
    "ɡ": "g",  # 라틴 소문자 스크립트 g
    "ӏ": "l",  # 키릴 소문자 팔로치카
    "ⅼ": "l",  # 소문자 로마 숫자 50
    "ⅰ": "i",  # 소문자 로마 숫자 1
}

# 전각(fullwidth) 아스키 룩얼라이크: U+FF01..U+FF5E → U+0021..U+007E
for _c in range(0xFF01, 0xFF5F):
    _CONFUSABLE_MAP[chr(_c)] = chr(_c - 0xFEE0)


def confusable_skeleton(s: str) -> str:
    """비ASCII 룩얼라이크를 ASCII 대응 문자로 접은 소문자 스켈레톤."""
    return "".join(_CONFUSABLE_MAP.get(ch, ch) for ch in s).lower()


def is_mixed_script(s: str) -> bool:
    """라틴 + (키릴|그리스)가 한 문자열에 섞였는지 — 전형적 IDN 호모그래프 공격.

    라틴+한자/한글 같은 정상 조합은 제외해 오탐을 막는다(위장에 쓰이는 스크립트만 대상).
    """
    has_latin = has_confusable_script = False
    for ch in s:
        if not ch.isalpha():
            continue
        o = ord(ch)
        if (0x41 <= o <= 0x5A) or (0x61 <= o <= 0x7A):
            has_latin = True
        elif (0x0400 <= o <= 0x04FF) or (0x0370 <= o <= 0x03FF):
            has_confusable_script = True  # 키릴 또는 그리스
    return has_latin and has_confusable_script


def decode_idna(host: str) -> str:
    """퓨니코드(xn--) 라벨을 원래 유니코드로 디코드(베스트 에포트, stdlib punycode)."""
    if "xn--" not in host:
        return host
    out: list[str] = []
    for label in host.split("."):
        if label.startswith("xn--"):
            try:
                out.append(label[4:].encode("ascii").decode("punycode"))
            except Exception:  # noqa: BLE001 — 디코드 실패 시 원본 유지
                out.append(label)
        else:
            out.append(label)
    return ".".join(out)


def is_confusable_host(host: str) -> bool:
    """호스트에 혼동 문자(룩얼라이크)나 혼합 스크립트가 있는지 — homoglyph 신호."""
    decoded = decode_idna(host)
    return is_mixed_script(decoded) or (confusable_skeleton(decoded) != decoded.lower())

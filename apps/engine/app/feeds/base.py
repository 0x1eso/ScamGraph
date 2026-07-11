"""위협 피드 공통 인터페이스와 정규화 유틸.

각 소스 어댑터는 fetch() 에서 정규화된 Indicator 목록을 돌려준다.
네트워크/키가 없어도 반드시 시드 표본으로 폴백해야 한다(데모 세이프).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class Indicator:
    """정규화된 위협 지표 — 모든 소스가 이 형태로 수렴한다."""

    value: str                      # 정규화된 지표 (host/domain/ip/phone)
    kind: str                       # url | domain | ip | phone | account
    source: str                     # openphish | urlhaus | threatfox | police_kr
    source_kind: str = "global"     # global | gov
    ip: str | None = None           # 연결된 IP (공유 시 그래프에서 클러스터)
    detail: str = ""                # 사람이 읽는 근거 문구
    tags: tuple[str, ...] = field(default_factory=tuple)


class FeedSource(Protocol):
    """모든 피드 소스 어댑터가 만족하는 계약."""

    id: str
    label: str
    source_kind: str

    def fetch(self) -> list[Indicator]:
        ...


def host_of(value: str) -> str:
    """URL 이면 host 만, 그 외엔 소문자 원본. (그래프 노드 매칭 규칙과 동일)"""
    v = (value or "").strip()
    if "://" in v:
        v = v.split("://", 1)[1]
    if "@" in v:
        v = v.split("@", 1)[1]
    v = v.split("/", 1)[0]
    v = v.split(":", 1)[0]
    return v.lower().strip()

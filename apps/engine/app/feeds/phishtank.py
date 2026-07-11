"""PhishTank 커뮤니티 피싱 목록 — 앱 키 발급 시 라이브(키 없으면 시드).

PhishTank 공개 데이터 다운로드는 회원가입+앱 키가 필요하다(무료). PHISHTANK_APP_KEY 가
있으면 online-valid 목록에서 한국 브랜드 사칭 URL 을 골라 지표로 만들고, 없거나 실패하면
시드로 폴백한다(데모 세이프). PhishTank 는 고유 User-Agent 를 요구한다.
"""
from __future__ import annotations

import os

import httpx

from .base import Indicator, host_of
from .brands import matched_brand
from .seed import SEED

_KEY = os.getenv("PHISHTANK_APP_KEY", "").strip()
_MAX = 60
_UA = "scamgraph-tip/1.0 (threat-intel research)"


class PhishTankSource:
    id = "phishtank"
    label = "PhishTank"
    source_kind = "global"

    def _url(self) -> str:
        return f"https://data.phishtank.com/data/{_KEY}/online-valid.json"

    def fetch(self) -> list[Indicator]:
        # 앱 키가 없으면 라이브 다운로드 불가 → 시드 폴백(데모 세이프).
        if not _KEY:
            return SEED[self.id]
        try:
            resp = httpx.get(self._url(), headers={"User-Agent": _UA},
                             timeout=8.0, follow_redirects=True)
            resp.raise_for_status()
            data = resp.json() or []
            out: list[Indicator] = []
            seen: set[str] = set()
            for entry in data:
                host = host_of(str(entry.get("url", "")))
                if not host or host in seen:
                    continue
                if not matched_brand(host):
                    continue
                seen.add(host)
                out.append(
                    Indicator(host, "domain", self.id,
                              detail="PhishTank 등재 · 커뮤니티 검증 피싱",
                              tags=("phishing",))
                )
                if len(out) >= _MAX:
                    break
            return out or SEED[self.id]
        except Exception:
            return SEED[self.id]

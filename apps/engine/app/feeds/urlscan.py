"""URLScan.io 공개 검색 — 최근 한국 브랜드 피싱 페이지(키 선택).

키 없이도 공개 검색 API 를 쓸 수 있으나 레이트리밋이 있다. URLSCAN_API_KEY 가 있으면
헤더(API-Key)로 넣어 한도를 높인다. 결과 도메인을 지표로 정규화하고, 실패하면 시드로 폴백.
"""
from __future__ import annotations

import os

import httpx

from .base import Indicator, host_of
from .brands import matched_brand
from .seed import SEED

_KEY = os.getenv("URLSCAN_API_KEY", "").strip()
_MAX = 60
# 최근 한국 브랜드 사칭 페이지 검색(공개 인덱스).
_QUERY = 'task.tags:"phishing" AND page.domain:(naver OR toss OR kbstar OR shinhan OR kakao)'


class UrlScanSource:
    id = "urlscan"
    label = "URLScan.io"
    source_kind = "global"
    API = "https://urlscan.io/api/v1/search/"

    def fetch(self) -> list[Indicator]:
        headers = {"API-Key": _KEY} if _KEY else {}
        try:
            resp = httpx.get(self.API, params={"q": _QUERY, "size": 100},
                             headers=headers, timeout=8.0)
            resp.raise_for_status()
            results = resp.json().get("results", []) or []
            out: list[Indicator] = []
            seen: set[str] = set()
            for item in results:
                page = item.get("page") or {}
                host = host_of(str(page.get("domain") or page.get("url") or ""))
                if not host or host in seen:
                    continue
                if not matched_brand(host):
                    continue
                seen.add(host)
                out.append(
                    Indicator(host, "domain", self.id,
                              detail="URLScan.io 최근 스캔 · 브랜드 사칭 페이지",
                              tags=("phishing",))
                )
                if len(out) >= _MAX:
                    break
            return out or SEED[self.id]
        except Exception:
            return SEED[self.id]

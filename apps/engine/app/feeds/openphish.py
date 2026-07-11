"""OpenPhish 커뮤니티 피드 — 무료·키 불필요(12시간 갱신).

공개 GitHub raw 피드에서 실제 피싱 URL 을 당겨 host 로 정규화한다.
실패하면 시드로 폴백(데모 세이프).
"""
from __future__ import annotations

import httpx

from .base import Indicator, host_of
from .seed import SEED

# 커뮤니티 피드(무료·키 불필요). 12시간마다 갱신.
FEED_URL = "https://raw.githubusercontent.com/openphish/public_feed/main/feed.txt"
_MAX = 60


class OpenPhishSource:
    id = "openphish"
    label = "OpenPhish"
    source_kind = "global"

    def fetch(self) -> list[Indicator]:
        try:
            resp = httpx.get(FEED_URL, timeout=6.0, follow_redirects=True)
            resp.raise_for_status()
            out: list[Indicator] = []
            for line in resp.text.splitlines():
                url = line.strip()
                if not url.startswith("http"):
                    continue
                host = host_of(url)
                if not host:
                    continue
                out.append(
                    Indicator(host, "domain", self.id,
                              detail="OpenPhish 등재 · 커뮤니티 피드", tags=("phishing",))
                )
                if len(out) >= _MAX:
                    break
            return out or SEED[self.id]
        except Exception:
            return SEED[self.id]

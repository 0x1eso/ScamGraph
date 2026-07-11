"""Certificate Transparency 브랜드 모니터 — crt.sh 공개 JSON(키 불필요).

새로 발급된 인증서의 CN/SAN 중 한국 브랜드 사칭 패턴(brand + 의심 토큰)을 골라 도메인
지표로 만든다. crt.sh 는 정상 인증서도 방대하므로 사칭 신호가 강한 것만 남긴다.
실패하면 시드로 폴백(데모 세이프).
"""
from __future__ import annotations

import httpx

from .base import Indicator, host_of
from .brands import WATCHED, looks_like_impersonation
from .seed import SEED

_MAX = 60


def _strip_wildcard(name: str) -> str:
    """와일드카드 인증서(*.evil.com) 의 선행 '*.' 를 떼고 host 로 정규화."""
    return host_of((name or "").strip().lstrip("*."))


class CrtShSource:
    id = "crt_sh"
    label = "crt.sh · CT 모니터"
    source_kind = "global"
    API = "https://crt.sh/"

    def fetch(self) -> list[Indicator]:
        try:
            out: list[Indicator] = []
            seen: set[str] = set()
            for brand in WATCHED:
                resp = httpx.get(
                    self.API,
                    params={"q": f"%{brand}%", "output": "json"},
                    timeout=6.0,
                )
                resp.raise_for_status()
                for cert in resp.json() or []:
                    names = str(cert.get("name_value", "")).splitlines()
                    names.append(str(cert.get("common_name", "")))
                    for raw in names:
                        host = _strip_wildcard(raw)
                        if not host or host in seen:
                            continue
                        if looks_like_impersonation(host):
                            seen.add(host)
                            out.append(
                                Indicator(host, "domain", self.id,
                                          detail="crt.sh 신규 인증서 · CT 브랜드 사칭 의심",
                                          tags=("phishing", "ct"))
                            )
                        if len(out) >= _MAX:
                            return out
            return out or SEED[self.id]
        except Exception:
            return SEED[self.id]

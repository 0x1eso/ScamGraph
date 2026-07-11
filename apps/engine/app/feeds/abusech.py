"""abuse.ch 피드 — URLhaus(악성 URL) · ThreatFox(IOC).

둘 다 무료지만 Auth-Key(무료 발급)가 필요하다. 키가 없거나 실패하면 시드로 폴백.
환경변수 ABUSECH_AUTH_KEY 로 키를 주입한다.
"""
from __future__ import annotations

import csv
import os

import httpx

from .base import Indicator, host_of
from .seed import SEED

_KEY = os.getenv("ABUSECH_AUTH_KEY", "").strip()
_MAX = 60


class URLhausSource:
    id = "urlhaus"
    label = "URLhaus · abuse.ch"
    source_kind = "global"
    CSV_URL = "https://urlhaus.abuse.ch/downloads/csv_recent/"

    def fetch(self) -> list[Indicator]:
        if not _KEY:
            return SEED[self.id]
        try:
            resp = httpx.get(self.CSV_URL, headers={"Auth-Key": _KEY}, timeout=8.0)
            resp.raise_for_status()
            out: list[Indicator] = []
            # 컬럼: id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter
            rows = csv.reader(
                line for line in resp.text.splitlines() if line and not line.startswith("#")
            )
            for row in rows:
                if len(row) < 3:
                    continue
                host = host_of(row[2].strip('"'))
                if not host:
                    continue
                out.append(
                    Indicator(host, "domain", self.id,
                              detail="URLhaus 등재 · abuse.ch", tags=("malware",))
                )
                if len(out) >= _MAX:
                    break
            return out or SEED[self.id]
        except Exception:
            return SEED[self.id]


class ThreatFoxSource:
    id = "threatfox"
    label = "ThreatFox · abuse.ch"
    source_kind = "global"
    API = "https://threatfox-api.abuse.ch/api/v1/"

    def fetch(self) -> list[Indicator]:
        if not _KEY:
            return SEED[self.id]
        try:
            resp = httpx.post(
                self.API, headers={"Auth-Key": _KEY},
                json={"query": "get_iocs", "days": 1}, timeout=8.0,
            )
            resp.raise_for_status()
            data = resp.json().get("data", []) or []
            out: list[Indicator] = []
            for item in data:
                ioc = str(item.get("ioc", "")).strip()
                ioc_type = str(item.get("ioc_type", ""))
                if not ioc:
                    continue
                if "ip" in ioc_type:
                    ip = ioc.split(":", 1)[0]
                    value, kind = ip, "ip"
                elif "domain" in ioc_type:
                    value, kind, ip = ioc.lower(), "domain", None
                elif "url" in ioc_type:
                    value, kind, ip = host_of(ioc), "domain", None
                else:
                    continue
                out.append(
                    Indicator(value, kind, self.id, ip=(ip if kind == "ip" else None),
                              detail="ThreatFox IOC · abuse.ch")
                )
                if len(out) >= _MAX:
                    break
            return out or SEED[self.id]
        except Exception:
            return SEED[self.id]

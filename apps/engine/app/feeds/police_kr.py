"""경찰청 보이스피싱 — 공공데이터포털(data.go.kr).

공개 데이터셋은 지역별 '통계'라 개별 지표(전화번호) API 는 없다. 데모에선 공개 경보
기반 시드 전화번호로 '국가기관 데이터'를 대표한다. 실제 활용신청 키(DATA_GO_KR_KEY)가
발급되면 통계 API 연동으로 확장 가능하도록 어댑터 형태를 갖춰 둔다.
"""
from __future__ import annotations

import os

from .base import Indicator
from .seed import SEED

_KEY = os.getenv("DATA_GO_KR_KEY", "").strip()


class PoliceKrSource:
    id = "police_kr"
    label = "경찰청 보이스피싱"
    source_kind = "gov"

    def fetch(self) -> list[Indicator]:
        # 공공데이터포털은 회원가입+활용신청(승인 지연)이 필요하므로 키가 없으면 시드 폴백.
        # 키가 있어도 공개 데이터셋은 통계이므로, 개별 지표는 공개 경보 기반 시드를 유지한다.
        return SEED[self.id]

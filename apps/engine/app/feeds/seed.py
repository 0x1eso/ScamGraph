"""데모 세이프 시드 표본 — 네트워크/키가 없어도 파이프라인이 실제처럼 동작한다.

값은 공개 위협 피드에서 흔히 관측되는 한국형 사기 패턴을 모사한 것(실제 피해 URL 아님).
일부는 **공유 IP** 를 갖도록 설계해, 그래프에서 서로 다른 도메인이 하나의 인프라로
묶이는 '교차 인프라 귀속' 킬샷이 오프라인에서도 재현되게 한다.
"""
from __future__ import annotations

from .base import Indicator

# 공유 IP 클러스터
_IP_A = "185.220.101.44"   # 토스 사칭 군집 (urlhaus + threatfox + crt_sh + urlscan 교차)
_IP_B = "91.219.236.12"    # 은행 OTP 사칭 군집 (urlhaus + crt_sh + phishtank)
_IP_C = "45.133.1.77"      # KB 사칭 군집 (threatfox C2 + crt_sh + urlscan)
_IP_D = "193.42.33.19"     # 네이버·카카오 사칭 군집 (crt_sh + urlscan + phishtank)

SEED: dict[str, list[Indicator]] = {
    "openphish": [
        Indicator("naver-security-check.xyz", "domain", "openphish", detail="OpenPhish 등재 · 커뮤니티 피드", tags=("phishing",)),
        Indicator("kakao-giftbox.top", "domain", "openphish", detail="OpenPhish 등재 · 커뮤니티 피드", tags=("phishing",)),
        Indicator("coupang-event-refund.click", "domain", "openphish", detail="OpenPhish 등재 · 커뮤니티 피드", tags=("phishing",)),
        Indicator("lotte-members-point.online", "domain", "openphish", detail="OpenPhish 등재 · 커뮤니티 피드", tags=("phishing",)),
        Indicator("cj-delivery-check.top", "domain", "openphish", detail="OpenPhish 등재 · 커뮤니티 피드", tags=("smishing",)),
    ],
    "urlhaus": [
        # 클러스터 A (토스 사칭) — threatfox 와 IP 공유 → 교차 피드 귀속
        Indicator("secure-tosspay.info", "domain", "urlhaus", ip=_IP_A, detail="URLhaus 등재 · abuse.ch", tags=("malware",)),
        Indicator("tosspay-help.info", "domain", "urlhaus", ip=_IP_A, detail="URLhaus 등재 · abuse.ch", tags=("malware",)),
        # 클러스터 B (은행 OTP 사칭)
        Indicator("shinhan-otp-confirm.xyz", "domain", "urlhaus", ip=_IP_B, detail="URLhaus 등재 · abuse.ch", tags=("malware",)),
        Indicator("woori-safe-login.top", "domain", "urlhaus", ip=_IP_B, detail="URLhaus 등재 · abuse.ch", tags=("malware",)),
    ],
    "threatfox": [
        # 클러스터 A 교차점 — urlhaus 도메인과 같은 IP
        Indicator("toss-verify.live", "domain", "threatfox", ip=_IP_A, detail="ThreatFox IOC · abuse.ch", tags=("smishing",)),
        # 클러스터 C (KB 사칭 C2)
        Indicator("kbstar-otp.live", "domain", "threatfox", ip=_IP_C, detail="ThreatFox IOC · abuse.ch", tags=("smishing",)),
        Indicator("kb-secure.help", "domain", "threatfox", ip=_IP_C, detail="ThreatFox IOC · abuse.ch", tags=("smishing",)),
        Indicator(_IP_C, "ip", "threatfox", ip=_IP_C, detail="ThreatFox C2 · abuse.ch", tags=("c2",)),
    ],
    # 경찰청(공공데이터포털) — 통계 데이터셋이라 지표는 공개 경보 기반 시드 전화번호.
    # 실제 API 키(DATA_GO_KR_KEY) 발급 시 통계 연동으로 확장 가능(어댑터 준비됨).
    "police_kr": [
        Indicator("070-8890-1234", "phone", "police_kr", source_kind="gov", detail="경찰청 보이스피싱 주의 번호"),
        Indicator("02-1661-0000", "phone", "police_kr", source_kind="gov", detail="검찰·기관 사칭 주의 번호"),
        Indicator("1600-8877", "phone", "police_kr", source_kind="gov", detail="택배 스미싱 발신 번호"),
    ],
    # CT(crt.sh) 신규 인증서 사칭 감시 — 기존 클러스터와 IP 를 공유해 '증서 발급→피싱
    # 인프라' 교차 귀속을 그래프에서 드러낸다.
    "crt_sh": [
        Indicator("toss-secure-cert.top", "domain", "crt_sh", ip=_IP_A, detail="crt.sh 신규 인증서 · CT 브랜드 사칭 의심", tags=("phishing", "ct")),
        Indicator("shinhan-otp-renew.help", "domain", "crt_sh", ip=_IP_B, detail="crt.sh 신규 인증서 · CT 브랜드 사칭 의심", tags=("phishing", "ct")),
        Indicator("kbstar-verify-center.live", "domain", "crt_sh", ip=_IP_C, detail="crt.sh 신규 인증서 · CT 브랜드 사칭 의심", tags=("phishing", "ct")),
        Indicator("naver-login-alert.cc", "domain", "crt_sh", ip=_IP_D, detail="crt.sh 신규 인증서 · CT 브랜드 사칭 의심", tags=("phishing", "ct")),
    ],
    # URLScan.io 최근 스캔 — 네이버·카카오 군집(_IP_D) 과 토스/KB 군집에 걸침.
    "urlscan": [
        Indicator("kakaopay-gift-event.click", "domain", "urlscan", ip=_IP_D, detail="URLScan.io 최근 스캔 · 브랜드 사칭 페이지", tags=("phishing",)),
        Indicator("naver-mail-secure.top", "domain", "urlscan", ip=_IP_D, detail="URLScan.io 최근 스캔 · 브랜드 사칭 페이지", tags=("phishing",)),
        Indicator("tosspay-refund-center.info", "domain", "urlscan", ip=_IP_A, detail="URLScan.io 최근 스캔 · 브랜드 사칭 페이지", tags=("phishing",)),
        Indicator("kbstar-safe-login.xyz", "domain", "urlscan", ip=_IP_C, detail="URLScan.io 최근 스캔 · 브랜드 사칭 페이지", tags=("phishing",)),
    ],
    # PhishTank 커뮤니티 검증 목록 — 앱 키 발급 시 라이브(현재는 시드).
    "phishtank": [
        Indicator("shinhan-cert-update.online", "domain", "phishtank", ip=_IP_B, detail="PhishTank 등재 · 커뮤니티 검증 피싱", tags=("phishing",)),
        Indicator("naverpay-point.click", "domain", "phishtank", ip=_IP_D, detail="PhishTank 등재 · 커뮤니티 검증 피싱", tags=("phishing",)),
        Indicator("toss-verify-help.top", "domain", "phishtank", ip=_IP_A, detail="PhishTank 등재 · 커뮤니티 검증 피싱", tags=("phishing",)),
        Indicator("kakao-account-safe.live", "domain", "phishtank", ip=_IP_D, detail="PhishTank 등재 · 커뮤니티 검증 피싱", tags=("phishing",)),
    ],
}

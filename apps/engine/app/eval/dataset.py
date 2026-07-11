"""정확도 평가용 라벨 데이터셋 (URL·전화).

- scam: 공개 위협 피드에서 관측되는 한국형 피싱/스미싱/보이스피싱 패턴을 모사.
- legit: 정상 서비스 도메인/번호. 오탐(false positive) 측정용.
값은 실제 피해 자산이 아니라 패턴 표본이다. 혼동문자 샘플은 키릴 문자(\\u04xx)를 쓴다.
"""
from __future__ import annotations

# (value, label) — label ∈ {"scam", "legit"}
SCAM: list[str] = [
    # 브랜드 사칭 + 키워드 + 위험 TLD
    "naver-security-check.xyz",
    "kbstar-otp.live",
    "shinhan-otp-confirm.xyz",
    "woori-safe-login.top",
    "coupang-event-refund.click",
    "paypal-verify.top",
    "kakaobank-secure.top",
    "nonghyup-otp.click",
    "epost-delivery.top",
    "hana-bank-verify.xyz",
    "toss-secure-otp.click",
    "samsung-reward-event.top",
    "apple-id-locked.xyz",
    "netflix-billing-update.top",
    # 브랜드 임베드(부분일치)
    "tosspay-help.info",
    "shinhancard-login.top",
    "kbstarbank-auth.click",
    "navercorp-support.xyz",
    # 타이포스쿼팅(편집거리 1~2)
    "navor.com",
    "kakau.com",
    "coupanq.com",
    "samsng.net",
    "g00gle-login.xyz",
    "paypa1-secure.com",
    # 혼동문자(키릴 알파벳)
    "nаver.com",          # 'а' = U+0430
    "kаkao-pay.top",
    "tоsspay.com",        # 'о' = U+043E
    # 배송/기관 사칭 스미싱
    "cj-delivery-check.top",
    "cj-logistics-parcel.xyz",
    "post-tracking-notice.click",
    "police-cyber-notice.top",
    "prosecutor-summons.xyz",
    "customs-tax-payment.click",
    "gov-subsidy-relief.top",
    # 구조적 신호(딥 서브도메인/IP/@)
    "login.secure.account.verify.kakao-help.top",
    "http://185.220.101.44/login",
    "http://account-update.com@evil-phish.top",
    "secure-login-verify-your-account-now-immediately.win",
    # 어휘/구조 신호가 없는 미묘한 사기 — 즉시 규칙(quick_assess)의 한계.
    # 실제로는 크롤 심화(인증정보 폼)·커뮤니티 신고로 잡힌다(정직한 오탐/미탐 표현).
    "luxury-outlet-sale.co",          # 가짜 쇼핑몰
    "investment-daily-profit.net",    # 투자 리딩방 사기
    "dating-meet-now.net",            # 로맨스 스캠
    "work-from-home-income.co",       # 구직 사기
    "crypto-airdrop-claim.net",       # 크립토 에어드랍 사기
    # 보이스피싱/스미싱 전화
    "070-8890-1234",
    "070-1234-5678",
    "050-7777-8888",
    "0084-555-1234",
    "070-9999-0001",
    "050-1111-2222",
]

LEGIT: list[str] = [
    # 화이트리스트 정상 도메인
    "naver.com",
    "www.naver.com",
    "blog.naver.com",
    "news.naver.com",
    "kakao.com",
    "kakaobank.com",
    "toss.im",
    "tossbank.com",
    "kbstar.com",
    "shinhan.com",
    "shinhancard.com",
    "wooribank.com",
    "nonghyup.com",
    "google.com",
    "youtube.com",
    "apple.com",
    "microsoft.com",
    "samsung.com",
    "coupang.com",
    "gov.kr",
    "police.go.kr",
    "fss.or.kr",
    "kisa.or.kr",
    "11st.co.kr",
    "gmarket.co.kr",
    "baemin.com",
    # 화이트리스트에 없지만 신호가 없는 정상 도메인(오탐 측정)
    "musinsa.com",
    "yes24.com",
    "melon.com",
    "daangn.com",
    "wemakeprice.com",
    "ridibooks.com",
    "kurly.com",
    "bandlab.com",
    "notion.so",
    "figma.com",
    # 정상 전화(시내/휴대폰 — 070/050/국제 아님)
    "02-1234-5678",
    "010-1234-5678",
    "031-777-8888",
    "1588-0000",
    "02-120",
    "010-9876-5432",
]

LABELED: list[tuple[str, str]] = (
    [(v, "scam") for v in SCAM] + [(v, "legit") for v in LEGIT]
)

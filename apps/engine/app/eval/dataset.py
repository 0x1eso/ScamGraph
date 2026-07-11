"""정확도 평가용 라벨 데이터셋 (URL·전화) — 카테고리별 균형 표본.

- scam: 공개 위협 피드에서 관측되는 한국형 피싱/스미싱/보이스피싱 패턴을 모사.
- legit: 정상 서비스 도메인/번호. 오탐(false positive) 측정용.

값은 실제 피해 자산이 아니라 패턴 표본이다. 혼동문자 샘플은 유니코드 이스케이프(\\uXXXX)로
키릴/그리스/전각 문자를 명시한다.

**정직성 원칙**: 100%를 만들려고 조작하지 않는다. 'subtle' 카테고리(어휘/구조 신호가 없는
사기)는 즉시 규칙(quick_assess)만으로는 잡히지 않는다 — 실제로는 크롤 심화(인증정보 폼)나
커뮤니티 신고로 잡히며, 여기서는 정직한 미탐(FN)으로 남겨 recall 의 현실적 한계를 드러낸다.

CATEGORIZED: (value, label, category) 삼중항. LABELED 는 하위호환용(value, label).
"""
from __future__ import annotations

# --- SCAM ---------------------------------------------------------------
_IMPERSONATION = [
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
    "ibk-otp-verify.top",
    "amazon-account-locked.xyz",
    # 브랜드 임베드(부분일치)
    "tosspay-help.info",
    "shinhancard-login.top",
    "kbstarbank-auth.click",
    "navercorp-support.xyz",
]

_TYPOSQUAT = [
    "navor.com",
    "kakau.com",
    "coupanq.com",
    "samsng.net",
    "g00gle-login.xyz",
    "paypa1-secure.com",
    "netfllix.top",
    "shinhon-bank.com",
    "woorl-login.top",
    "kbstat-secure.xyz",
]

_HOMOGLYPH = [
    "nаver.com",              # nаver — 키릴 а (U+0430), 화이트리스트 표적
    "kаkao-pay.top",          # kаkao-pay
    "tоsspay.com",            # tоsspay — 키릴 о (U+043E)
    "paypаl-login.com",       # paypаl-login (혼합 스크립트)
    "gοοgle-verify.com",  # gοοgle — 그리스 ο (U+03BF)
    "shіnhan-otp.top",        # shіnhan — 키릴 і (U+0456)
    "аpple-id.com",           # аpple-id
    "ｎaver-login.com",        # 전각 ｎ(U+FF4E)aver-login
    "netflіx-billing.top",    # netflіx-billing
    "xn--pple-43d.com",            # 퓨니코드 → аpple (키릴)
]

_SMISHING = [
    "cj-delivery-check.top",
    "cj-logistics-parcel.xyz",
    "post-tracking-notice.click",
    "police-cyber-notice.top",
    "prosecutor-summons.xyz",
    "customs-tax-payment.click",
    "gov-subsidy-relief.top",
    "court-fine-notice.top",
    "traffic-fine-payment.xyz",
    "health-benefit-claim.top",
]

_SHORTENER = [
    "bit.ly/3xR2p",
    "tinyurl.com/y8scpay",
    "is.gd/abc123",
    "han.gl/aB3xk",
    "buly.kr/xY12z",
    "me2.do/x9Kd",
    "t.co/9zXqAb",
    "goo.gl/Xk2p9",
    "vo.la/aScmg",
    "cutt.ly/refundnow",
]

_STRUCTURAL = [
    "login.secure.account.verify.kakao-help.top",   # 딥 서브도메인 + 브랜드
    "http://185.220.101.44/login",                  # 점10진 IP
    "http://account-update.com@evil-phish.top",     # @ 은폐
    "secure-login-verify-your-account-now-immediately.win",  # 긴 URL + 키워드
    "naver.com.account-verify.top",                 # 브랜드-서브도메인
    "kakao.com.security-check.top",                 # 브랜드-서브도메인
    "shinhan.co.kr.login-secure.top",               # 브랜드-서브도메인(멀티파트 위장)
    "http://3626568449/login",                      # decimal IP 인코딩
    "http://0x8b.0xdc.0x65.0x2c/verify",            # hex IP 인코딩
    "http://toss-login.evil.top:8443/verify",       # 비표준 포트 + 브랜드-서브도메인
    "http://kb-login-secure.com/%252fverify",       # 이중 인코딩
]

# 어휘/구조 신호가 없는 미묘한 사기 — 즉시 규칙의 한계(정직한 FN).
_SUBTLE = [
    "luxury-outlet-sale.co",
    "investment-daily-profit.net",
    "dating-meet-now.net",
    "work-from-home-income.co",
    "crypto-airdrop-claim.net",
    "premium-brand-store.shop",
]

_SCAM_PHONE = [
    "070-8890-1234",
    "070-1234-5678",
    "050-7777-8888",
    "0084-555-1234",
    "070-9999-0001",
    "050-1111-2222",
    "+63-2-8888-1234",
    "070-3030-4040",
]

# --- LEGIT --------------------------------------------------------------
_ALLOWLIST = [
    "naver.com", "www.naver.com", "blog.naver.com", "news.naver.com",
    "kakao.com", "kakaobank.com", "toss.im", "tossbank.com",
    "kbstar.com", "shinhan.com", "shinhancard.com", "wooribank.com",
    "nonghyup.com", "google.com", "youtube.com", "apple.com",
    "microsoft.com", "samsung.com", "coupang.com", "gov.kr",
    "police.go.kr", "fss.or.kr", "kisa.or.kr", "11st.co.kr",
    "gmarket.co.kr", "baemin.com", "ibk.co.kr", "hanabank.com",
]

# 화이트리스트에 없지만 신호가 없는 정상 도메인(오탐 측정 — precision 방어)
_CLEAN = [
    # 국내 서비스
    "musinsa.com", "yes24.com", "melon.com", "daangn.com", "wemakeprice.com",
    "ridibooks.com", "kurly.com", "bandlab.com", "zigbang.com", "yanolja.com",
    "watcha.com", "flitto.com", "spoqa.com", "aladin.co.kr", "wadiz.kr",
    "socar.kr", "interpark.com", "tmon.co.kr", "ohou.se", "class101.net",
    # 글로벌 서비스
    "github.com", "gitlab.com", "stackoverflow.com", "wikipedia.org", "reddit.com",
    "spotify.com", "dropbox.com", "slack.com", "zoom.us", "trello.com",
    "airbnb.com", "booking.com", "medium.com", "vercel.com", "cloudflare.com",
    "npmjs.com", "pypi.org", "mozilla.org", "arxiv.org", "notion.so",
    "figma.com", "atlassian.com", "canva.com", "grammarly.com",
]

_LEGIT_PHONE = [
    "02-1234-5678", "010-1234-5678", "031-777-8888", "1588-0000",
    "02-120", "010-9876-5432", "051-123-4567", "042-999-8888",
]

# (value, label, category)
CATEGORIZED: list[tuple[str, str, str]] = (
    [(v, "scam", "impersonation") for v in _IMPERSONATION]
    + [(v, "scam", "typosquat") for v in _TYPOSQUAT]
    + [(v, "scam", "homoglyph") for v in _HOMOGLYPH]
    + [(v, "scam", "smishing") for v in _SMISHING]
    + [(v, "scam", "shortener") for v in _SHORTENER]
    + [(v, "scam", "structural") for v in _STRUCTURAL]
    + [(v, "scam", "subtle") for v in _SUBTLE]
    + [(v, "scam", "phone") for v in _SCAM_PHONE]
    + [(v, "legit", "allowlist") for v in _ALLOWLIST]
    + [(v, "legit", "clean") for v in _CLEAN]
    + [(v, "legit", "phone") for v in _LEGIT_PHONE]
)

# 하위호환: (value, label)
SCAM: list[str] = [v for v, lbl, _ in CATEGORIZED if lbl == "scam"]
LEGIT: list[str] = [v for v, lbl, _ in CATEGORIZED if lbl == "legit"]
LABELED: list[tuple[str, str]] = [(v, lbl) for v, lbl, _ in CATEGORIZED]

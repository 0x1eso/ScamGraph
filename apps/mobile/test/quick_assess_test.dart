import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:scamgraph_mobile/engine/quick_assess.dart';
import 'package:scamgraph_mobile/models.dart';

/// 오프라인 Dart 엔진의 golden 테스트.
///
/// 파이썬 엔진(`apps/engine/app/crawler.py`)의 `quick_assess` 와 판정이 일치하는지
/// 대표 표본으로 검증한다. 샘플은 `apps/engine/app/eval/dataset.py` 를 미러링하되,
/// **quick_assess 가 어휘/구조 신호 없이 확실히 잡거나(스캠) 안전한(정상)** 항목만 골랐다.
/// (dataset 의 "미묘한 스캠"—luxury-outlet-sale.co 등—은 규칙 단독으로는 못 잡는 것이
///  정상이며, 실제로는 크롤 심화·커뮤니티 신고로 탐지된다.)
void main() {
  // contract 미러 자산을 직접 로드해 순수 엔진을 구성한다(플러터 바인딩 불필요).
  final raw = File('assets/rules.json').readAsStringSync();
  final config = jsonDecode(raw) as Map<String, dynamic>;
  final engine = QuickAssessEngine.fromJson(config);

  // caution/warning/danger = 사기로 간주 (contract grades_considered_scam).
  const scamGrades = {Grade.caution, Grade.warning, Grade.danger};

  group('스캠 표본은 사기 등급으로 판정한다', () {
    const scamSamples = <String>[
      // 브랜드 사칭 + 키워드 + 위험 TLD
      'naver-security-check.xyz',
      'kbstar-otp.live',
      'coupang-event-refund.click',
      'paypal-verify.top',
      'toss-secure-otp.click',
      'apple-id-locked.xyz',
      // 브랜드 임베드(부분일치)
      'tosspay-help.info',
      'shinhancard-login.top',
      // 타이포스쿼팅(편집거리 1~2)
      'navor.com',
      'coupanq.com',
      'g00gle-login.xyz',
      // 배송/기관 사칭
      'cj-delivery-check.top',
      'customs-tax-payment.click',
      // 구조 신호
      'login.secure.account.verify.kakao-help.top',
      'http://185.220.101.44/login',
      'http://account-update.com@evil-phish.top',
      // 인코딩된 IP(10진) — obfuscated_ip
      'http://3626568449/login',
      // 전각(fullwidth) 혼동문자 위장 — 'ｎ'(U+FF4E) → 스켈레톤 'naver.com'
      'ｎaver.com',
      // 보이스피싱/스미싱 전화 (VoIP·국제)
      '070-8890-1234',
      '050-7777-8888',
      '+1-202-555-0100',
    ];

    for (final sample in scamSamples) {
      test('scam: $sample', () {
        final result = engine.assess(sample);
        expect(
          scamGrades.contains(result.grade),
          isTrue,
          reason: '$sample → ${result.grade.name} (score ${result.riskScore})',
        );
      });
    }
  });

  group('정상 표본은 안전으로 판정한다', () {
    const legitSamples = <String>[
      // 화이트리스트
      'naver.com',
      'www.naver.com',
      'blog.naver.com',
      'kakaobank.com',
      'toss.im',
      'shinhan.com',
      'google.com',
      'gov.kr',
      'police.go.kr',
      // 화이트리스트에 없지만 신호가 없는 정상 도메인
      'musinsa.com',
      'notion.so',
      'figma.com',
      // 정상 전화 (070/050/국제 아님)
      '02-1234-5678',
      '010-1234-5678',
      '031-777-8888',
    ];

    for (final sample in legitSamples) {
      test('legit: $sample', () {
        final result = engine.assess(sample);
        expect(
          result.grade,
          Grade.safe,
          reason: '$sample → ${result.grade.name} (score ${result.riskScore})',
        );
      });
    }
  });

  group('규칙별 동작(파이썬 구현 미러)', () {
    test('화이트리스트는 즉시 verified_domain 으로 safe', () {
      final result = engine.assess('www.naver.com');
      expect(result.grade, Grade.safe);
      expect(result.riskScore, 0);
      expect(result.reasons.single.rule, 'verified_domain');
    });

    test('혼동 문자(키릴)는 homoglyph 규칙을 발동하고 스켈레톤이 화이트리스트와 일치하면 가중 상향', () {
      // 'nаver.com' — 'а' 는 키릴(U+0430) 룩얼라이크. 스켈레톤 'naver.com' 은 화이트리스트 → 표적 위장.
      final result = engine.assess('nаver.com');
      final homoglyph =
          result.reasons.where((r) => r.rule == 'homoglyph').toList();
      expect(homoglyph, isNotEmpty);
      expect(homoglyph.single.weight, 50); // 표적 위장 가중치.
      expect(scamGrades.contains(result.grade), isTrue);
    });

    test('새 규칙: 단축 URL·이중 인코딩·비표준 포트·인코딩된 IP 를 발동한다', () {
      expect(
        engine.assess('http://bit.ly/abcd').reasons.any((r) => r.rule == 'url_shortener'),
        isTrue,
      );
      expect(
        engine.assess('http://x.com/a%252Fb').reasons.any((r) => r.rule == 'double_encoding'),
        isTrue,
      );
      expect(
        engine.assess('http://example.com:8443/a').reasons.any((r) => r.rule == 'nonstandard_port'),
        isTrue,
      );
      expect(
        engine.assess('http://0x7f000001/login').reasons.any((r) => r.rule == 'obfuscated_ip'),
        isTrue,
      );
    });

    test('브랜드-서브도메인 위장(brand_subdomain)을 발동한다', () {
      // 'naver' 는 서브도메인에만, 실제 등록 도메인은 'evil-login.top'.
      final result = engine.assess('naver.evil-login.top');
      expect(result.reasons.any((r) => r.rule == 'brand_subdomain'), isTrue);
    });

    test('IP 호스트는 ip_host 규칙을 발동한다', () {
      final result = engine.assess('http://185.220.101.44/login');
      expect(result.kind, 'url');
      expect(result.reasons.any((r) => r.rule == 'ip_host'), isTrue);
    });

    test('VoIP(070)는 voip_prefix 규칙을 발동한다', () {
      final result = engine.assess('070-8890-1234');
      expect(result.kind, 'phone');
      expect(result.reasons.any((r) => r.rule == 'voip_prefix'), isTrue);
    });

    test('브랜드 사칭은 brand_impersonation, 오타는 typosquatting', () {
      final imp = engine.assess('naver-security-check.xyz');
      expect(imp.reasons.any((r) => r.rule == 'brand_impersonation'), isTrue);

      final typo = engine.assess('navor.com');
      expect(typo.reasons.any((r) => r.rule == 'typosquatting'), isTrue);
    });

    test('점수는 100 을 넘지 않는다', () {
      final result = engine.assess('login.secure.account.verify.kakao-help.top');
      expect(result.riskScore, lessThanOrEqualTo(100));
    });

    test('classify: url / phone / account 분류', () {
      expect(engine.classify('https://example.com'), 'url');
      expect(engine.classify('010-1234-5678'), 'phone');
      expect(engine.classify('110234567890123'), 'account');
    });

    test('hostOf 는 경로/쿼리의 @ 에 속지 않는다 — 화이트리스트 도메인을 보존한다', () {
      // 리다이렉트 파라미터의 '@'(login@evil-phish.top)가 있어도 실제 호스트는
      // www.naver.com 이므로 즉시 safe 여야 한다(파이썬 urlparse().hostname 과 동일).
      final result =
          engine.assess('https://www.naver.com/redirect?url=login@evil-phish.top');
      expect(result.grade, Grade.safe);
      expect(result.riskScore, 0);
      expect(result.reasons.single.rule, 'verified_domain');
    });

    test('인코딩된 IP·전각 혼동문자·국제전화가 규칙을 발동한다', () {
      expect(
        engine.assess('http://3626568449/login').reasons.any((r) => r.rule == 'obfuscated_ip'),
        isTrue,
      );
      expect(
        engine.assess('ｎaver.com').reasons.any((r) => r.rule == 'homoglyph'),
        isTrue,
      );
      final intl = engine.assess('+1-202-555-0100');
      expect(intl.kind, 'phone');
      expect(intl.reasons.any((r) => r.rule == 'intl_prefix'), isTrue);
    });
  });

  // 드리프트 없는 단일 규칙 입력은 파이썬 crawler.py 와 **점수까지** 일치해야 한다.
  // (url_shortener/double_encoding/nonstandard_port 는 contract·엔진 가중치가 달라 제외.)
  group('파이썬 엔진과 점수까지 일치(비드리프트 규칙)', () {
    test('혼동문자 표적 위장은 정확히 homoglyph 50 점', () {
      // 'nаver.com' — 'а'(U+0430 키릴). 스켈레톤 naver.com=화이트리스트 → 50, 다른 신호 없음.
      final result = engine.assess('nаver.com');
      expect(result.riskScore, 50);
      expect(result.grade, Grade.warning);
    });

    test('타이포스쿼팅 단독은 정확히 typosquatting 38 점', () {
      final result = engine.assess('navor.com'); // navor≈naver(편집거리 1)
      expect(result.riskScore, 38);
      expect(result.grade, Grade.warning);
    });

    test('VoIP 단독은 정확히 voip_prefix 20 점(caution)', () {
      final result = engine.assess('070-1111-2222');
      expect(result.kind, 'phone');
      expect(result.riskScore, 20);
      expect(result.grade, Grade.caution);
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:scamgraph_mobile/data/blocklist.dart';

/// 로컬 blocklist 오프라인 멤버십 테스트.
///
/// 서버 동기화 전에도 내장 시드로 즉시 판정되어야 한다(demo-safe).
void main() {
  test('동기화 전에도 내장 시드로 멤버십을 판정한다', () {
    final store = BlocklistStore();

    // 도메인 등재 — danger.
    final domainHit = store.match('secure-tosspay.info');
    expect(domainHit, isNotNull);
    expect(domainHit!.severity, 'danger');
    expect(domainHit.kind, 'domain');

    // URL 형태도 호스트로 정규화해 매칭.
    expect(store.match('https://secure-tosspay.info/login?x=1'), isNotNull);

    // 서브도메인도 매칭.
    expect(store.match('pay.secure-tosspay.info'), isNotNull);

    // 전화 등재 — warning.
    final phoneHit = store.match('070-8890-1234');
    expect(phoneHit, isNotNull);
    expect(phoneHit!.kind, 'phone');
    expect(phoneHit.severity, 'warning');

    // 표기가 달라도(하이픈 유무) 숫자 정규화로 매칭.
    expect(store.match('07088901234'), isNotNull);

    // 미등재는 null.
    expect(store.match('naver.com'), isNull);
    expect(store.match('010-0000-0000'), isNull);

    store.close();
  });

  test('시드는 게이트웨이 BlocklistController.seed() 와 동일한 건수', () {
    final store = BlocklistStore()..match('warm-up'); // 시드 로드 트리거.
    expect(store.entries.length, 5);
    expect(store.meta?.seed, isTrue);
    store.close();
  });
}

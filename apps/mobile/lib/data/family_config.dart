import 'dart:convert';
import 'dart:math';

import '../config_store.dart';

/// 가족 보호 모드 설정 (온‑디바이스, 스켈레톤).
///
/// 실제 보호자 연동(서버 페어링·이벤트 전송)은 아직 구현하지 않는다 — UI/상태만 유지한다.
/// 스토킹 악용을 막기 위해 **보호 대상자 본인 동의(consent)** 없이는 활성화되지 않는다.
class FamilyConfig {
  const FamilyConfig({
    required this.enabled,
    required this.consent,
    required this.dangerOnly,
    required this.pairingCode,
    required this.guardianCode,
  });

  /// 보호 모드 활성 여부. 활성화는 [consent] 가 참이어야만 가능.
  final bool enabled;

  /// 보호 대상자 본인이 동의했는지 (스토킹 방지 필수 게이트).
  final bool consent;

  /// 위험(danger) 이벤트만 보호자에게 알릴지. false 면 주의(warning)까지 포함.
  final bool dangerOnly;

  /// 이 기기의 페어링 코드 (보호자가 입력해 연결).
  final String pairingCode;

  /// 연결된 보호자 코드 (없으면 빈 문자열).
  final String guardianCode;

  static const FamilyConfig empty = FamilyConfig(
    enabled: false,
    consent: false,
    dangerOnly: true,
    pairingCode: '',
    guardianCode: '',
  );

  bool get isPaired => guardianCode.isNotEmpty;

  FamilyConfig copyWith({
    bool? enabled,
    bool? consent,
    bool? dangerOnly,
    String? pairingCode,
    String? guardianCode,
  }) {
    return FamilyConfig(
      enabled: enabled ?? this.enabled,
      consent: consent ?? this.consent,
      dangerOnly: dangerOnly ?? this.dangerOnly,
      pairingCode: pairingCode ?? this.pairingCode,
      guardianCode: guardianCode ?? this.guardianCode,
    );
  }

  Map<String, dynamic> toJson() => {
        'enabled': enabled,
        'consent': consent,
        'danger_only': dangerOnly,
        'pairing_code': pairingCode,
        'guardian_code': guardianCode,
      };

  factory FamilyConfig.fromJson(Map<String, dynamic> json) => FamilyConfig(
        enabled: json['enabled'] == true,
        consent: json['consent'] == true,
        dangerOnly: json['danger_only'] != false, // 기본 true
        pairingCode: (json['pairing_code'] ?? '').toString(),
        guardianCode: (json['guardian_code'] ?? '').toString(),
      );

  /// 6자리 페어링 코드 생성 (사람이 읽고 입력하기 쉬운 숫자).
  static String generatePairingCode() {
    final rnd = Random.secure();
    final n = rnd.nextInt(1000000);
    return n.toString().padLeft(6, '0');
  }
}

/// 가족 보호 설정의 로컬 영속화 (네이티브 SharedPreferences 공유 키 사용).
class FamilyConfigStore {
  const FamilyConfigStore(this._config);

  final ConfigStore _config;

  static const String _prefKey = 'family_config';

  Future<FamilyConfig> load() async {
    final raw = await _config.getPref(_prefKey);
    if (raw == null || raw.isEmpty) return FamilyConfig.empty;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return FamilyConfig.empty;
      return FamilyConfig.fromJson(Map<String, dynamic>.from(decoded));
    } catch (_) {
      return FamilyConfig.empty;
    }
  }

  Future<void> save(FamilyConfig config) async {
    await _config.setPref(_prefKey, jsonEncode(config.toJson()));
  }
}

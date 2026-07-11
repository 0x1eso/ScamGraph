import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config_store.dart';
import '../engine/quick_assess.dart' show hostOf;

/// 네이티브 SharedPreferences 에 캐시되는 blocklist 관련 키.
/// Kotlin(SmsReceiver / CallScreeningService)이 같은 키로 읽는다 — 단일 진실 공급원.
const String kBlocklistPrefKey = 'blocklist';
const String kBlocklistMetaPrefKey = 'blocklist_meta';

/// 로컬 blocklist 한 건. 게이트웨이 `/api/blocklist/snapshot` 의 entry 미러.
class BlocklistEntry {
  const BlocklistEntry({
    required this.value,
    required this.kind,
    required this.source,
    required this.severity,
  });

  /// 도메인 또는 전화번호 원문.
  final String value;

  /// "domain" | "phone"
  final String kind;

  /// 위협 출처 (openphish · urlhaus · threatfox · police_kr …).
  final String source;

  /// "danger" | "warning"
  final String severity;

  bool get isDanger => severity == 'danger';

  factory BlocklistEntry.fromJson(Map<String, dynamic> json) => BlocklistEntry(
        value: (json['value'] ?? '').toString(),
        kind: (json['kind'] ?? 'domain').toString(),
        source: (json['source'] ?? 'unknown').toString(),
        severity: (json['severity'] ?? 'danger').toString(),
      );

  Map<String, dynamic> toJson() => {
        'value': value,
        'kind': kind,
        'source': source,
        'severity': severity,
      };
}

/// blocklist 동기화 메타데이터 (UI 표시용).
class BlocklistMeta {
  const BlocklistMeta({
    required this.version,
    required this.hash,
    required this.count,
    required this.syncedAt,
    required this.seed,
  });

  final String version;
  final String hash;
  final int count;
  final DateTime? syncedAt;

  /// 서버 동기화 없이 내장 시드로 동작 중인지.
  final bool seed;

  Map<String, dynamic> toJson() => {
        'version': version,
        'hash': hash,
        'count': count,
        'synced_at': syncedAt?.toIso8601String(),
        'seed': seed,
      };

  factory BlocklistMeta.fromJson(Map<String, dynamic> json) => BlocklistMeta(
        version: (json['version'] ?? '').toString(),
        hash: (json['hash'] ?? '').toString(),
        count: (json['count'] is num) ? (json['count'] as num).toInt() : 0,
        syncedAt: DateTime.tryParse(json['synced_at']?.toString() ?? ''),
        seed: json['seed'] == true,
      );
}

/// 데모 세이프 내장 시드 — 게이트웨이 `BlocklistController.seed()` 미러.
/// 서버 동기화를 한 번도 못 해도 오프라인 멤버십 판정이 즉시 동작한다.
const List<Map<String, String>> _seedEntries = [
  {'value': 'secure-tosspay.info', 'kind': 'domain', 'source': 'urlhaus', 'severity': 'danger'},
  {'value': 'naver-security-check.xyz', 'kind': 'domain', 'source': 'openphish', 'severity': 'danger'},
  {'value': 'kbstar-otp.live', 'kind': 'domain', 'source': 'threatfox', 'severity': 'danger'},
  {'value': 'cj-delivery-check.top', 'kind': 'domain', 'source': 'openphish', 'severity': 'danger'},
  {'value': '070-8890-1234', 'kind': 'phone', 'source': 'police_kr', 'severity': 'warning'},
];

/// 로컬 위협 blocklist: 게이트웨이 스냅샷을 캐시하고 오프라인 멤버십을 판정한다.
///
/// - `sync()` : `${baseUrl}/api/blocklist/snapshot` 을 받아 네이티브 prefs 에 캐시.
/// - `load()` : 캐시(없으면 시드)를 메모리에 적재.
/// - `match()`: URL/도메인·전화번호가 blocklist 에 있는지 즉시 판정 (네트워크 없음).
class BlocklistStore {
  BlocklistStore({ConfigStore? config, http.Client? client})
      : _config = config ?? const ConfigStore(),
        _client = client ?? http.Client();

  final ConfigStore _config;
  final http.Client _client;

  List<BlocklistEntry> _entries = const [];
  BlocklistMeta? _meta;
  bool _loaded = false;

  List<BlocklistEntry> get entries => List.unmodifiable(_entries);
  BlocklistMeta? get meta => _meta;
  bool get loaded => _loaded;
  int get count => _entries.length;

  /// 캐시된 blocklist(없으면 시드)를 메모리로 로드한다.
  Future<void> load() async {
    final rawEntries = await _config.getPref(kBlocklistPrefKey);
    final rawMeta = await _config.getPref(kBlocklistMetaPrefKey);

    final parsed = _parseEntries(rawEntries);
    if (parsed.isEmpty) {
      _applySeed();
    } else {
      _entries = parsed;
      _meta = _parseMeta(rawMeta) ??
          BlocklistMeta(
            version: '${parsed.length}-cached',
            hash: '',
            count: parsed.length,
            syncedAt: null,
            seed: false,
          );
    }
    _loaded = true;
  }

  /// 게이트웨이에서 최신 스냅샷을 받아 캐시·메모리를 갱신한다.
  ///
  /// 실패하면 예외를 던지지 않고 false 를 반환한다(기존 캐시/시드 유지 — demo-safe).
  Future<bool> sync(String baseUrl, {Duration timeout = const Duration(seconds: 8)}) async {
    final normalizedBase = _normalizeBaseUrl(baseUrl);
    final uri = Uri.parse('$normalizedBase/api/blocklist/snapshot');

    try {
      final response = await _client.get(uri).timeout(timeout);
      if (response.statusCode != 200) return false;

      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is! Map) return false;

      final rawList = decoded['entries'];
      if (rawList is! List) return false;

      final parsed = rawList
          .whereType<Map>()
          .map((m) => BlocklistEntry.fromJson(Map<String, dynamic>.from(m)))
          .where((e) => e.value.isNotEmpty)
          .toList();
      if (parsed.isEmpty) return false;

      _entries = parsed;
      _meta = BlocklistMeta(
        version: (decoded['version'] ?? '').toString(),
        hash: (decoded['hash'] ?? '').toString(),
        count: parsed.length,
        syncedAt: DateTime.now(),
        seed: false,
      );
      _loaded = true;

      // Kotlin(SMS·통화)이 읽는 캐시에 그대로 저장.
      await _config.setPref(
        kBlocklistPrefKey,
        jsonEncode(parsed.map((e) => e.toJson()).toList()),
      );
      await _config.setPref(kBlocklistMetaPrefKey, jsonEncode(_meta!.toJson()));
      return true;
    } on TimeoutException {
      return false;
    } catch (_) {
      return false;
    }
  }

  /// [value] (URL·도메인·전화번호)가 blocklist 에 있으면 해당 entry, 없으면 null.
  BlocklistEntry? match(String value) {
    if (!_loaded) _applySeed();
    final raw = value.trim();
    if (raw.isEmpty) return null;

    final digits = raw.replaceAll(RegExp(r'\D'), '');
    final looksPhone = !RegExp(r'[a-zA-Z]').hasMatch(raw) &&
        !raw.contains('/') &&
        digits.length >= 9 &&
        digits.length <= 11;

    if (looksPhone) {
      for (final e in _entries) {
        if (e.kind != 'phone') continue;
        if (e.value.replaceAll(RegExp(r'\D'), '') == digits) return e;
      }
      return null;
    }

    final host = hostOf(raw);
    for (final e in _entries) {
      if (e.kind == 'phone') continue;
      final ev = e.value.toLowerCase();
      if (ev == raw.toLowerCase() ||
          ev == host ||
          (host.isNotEmpty && host.endsWith('.$ev'))) {
        return e;
      }
    }
    return null;
  }

  void _applySeed() {
    _entries = _seedEntries.map(BlocklistEntry.fromJson).toList();
    _meta = BlocklistMeta(
      version: '${_entries.length}-seed',
      hash: '',
      count: _entries.length,
      syncedAt: null,
      seed: true,
    );
    _loaded = true;
  }

  List<BlocklistEntry> _parseEntries(String? raw) {
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((m) => BlocklistEntry.fromJson(Map<String, dynamic>.from(m)))
          .where((e) => e.value.isNotEmpty)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  BlocklistMeta? _parseMeta(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      return BlocklistMeta.fromJson(Map<String, dynamic>.from(decoded));
    } catch (_) {
      return null;
    }
  }

  static String _normalizeBaseUrl(String baseUrl) {
    var url = baseUrl.trim();
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    return url;
  }

  void close() => _client.close();
}

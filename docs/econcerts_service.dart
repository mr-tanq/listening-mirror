// ============================
// econcerts_service.dart (PART 1/4)
// Full file (delete & paste)
// ============================

import 'concert_model.dart';
import 'schedule_checker.dart';
import 'concert_matcher.dart';
import 'econcerts_storage.dart';

class EConcertsRefreshResult {
  final List<Concert> upcomingSuggested;
  final List<Concert> shouldNotifyNow;
  final DateTime refreshedAt;

  const EConcertsRefreshResult({
    required this.upcomingSuggested,
    required this.shouldNotifyNow,
    required this.refreshedAt,
  });
}

class EConcertsService {
  final ConcertMatcher matcher;

  final Map<String, Concert> _storeById = {};
  bool _loaded = false;

  EConcertsService({ConcertMatcher? matcher})
      : matcher = matcher ?? const ConcertMatcher();

  /// Call once on app start (or before first UI render).
  Future<void> init() async {
    if (_loaded) return;
    final loaded = await EConcertsStorage.load();
    _storeById
      ..clear()
      ..addAll(loaded);
    _loaded = true;
  }

  Future<void> _persist() async {
    await EConcertsStorage.save(_storeById);
  }

  List<Concert> get allStored =>
      _storeById.values.toList()..sort(_byDateAsc);

  List<Concert> get myPlan {
    final list = _storeById.values
        .where((c) => c.status == ConcertStatus.planned)
        .toList();
    list.sort(_byDateAsc);
    return list;
  }

  List<Concert> get suggestions {
    final now = DateTime.now();
    final list = _storeById.values
        .where((c) =>
            c.status == ConcertStatus.suggested &&
            c.startDateTimeLocal.isAfter(now))
        .toList();
    list.sort(_byPriorityDescThenDateAsc);
    return list;
  }
// ============================
// econcerts_service.dart (PART 2/4)
// ============================

  Future<void> addToPlan(String concertId) async {
    final c = _storeById[concertId];
    if (c == null) return;
    _storeById[concertId] = c.copyWith(
      status: ConcertStatus.planned,
      updatedAt: DateTime.now(),
    );
    await _persist();
  }

  Future<void> dismiss(String concertId) async {
    final c = _storeById[concertId];
    if (c == null) return;
    _storeById[concertId] = c.copyWith(
      status: ConcertStatus.dismissed,
      updatedAt: DateTime.now(),
    );
    await _persist();
  }

  /// Main refresh. Make sure init() has been called first.
  Future<EConcertsRefreshResult> refresh({
    required ListeningProfile profile,
    DateTime? now,
  }) async {
    final t0 = now ?? DateTime.now();

    // 1) Fetch raw events (mock)
    final raw = _mockEvents(now: t0);

    // 2) Process pipeline
    final List<Concert> processed = [];
    for (final e in raw) {
      final concert = _createSuggestedConcertFromMock(e);
      final enriched = enrichConcertWithSchedule(concert);
      final scored = matcher.scoreConcert(concert: enriched, profile: profile);
      processed.add(scored);
    }

    // 3) Merge into store (keep user intent)
    for (final c in processed) {
      final existing = _storeById[c.id];

      if (existing == null) {
        _storeById[c.id] = c;
      } else {
        _storeById[c.id] = c.copyWith(
          status: existing.status,
          createdAt: existing.createdAt,
          updatedAt: DateTime.now(),
          extra: {
            ...c.extra,
            ...existing.extra, // keep things like lastNotifiedAt
          },
        );
      }
    }

    // 4) Build result lists
    final upcomingSuggested = suggestions;

    final shouldNotifyNow = upcomingSuggested
        .where((c) => matcher.shouldNotify(c))
        .where((c) => !_recentlyNotified(c, now: t0))
        .toList();

    // 5) Mark notifications + persist
    for (final c in shouldNotifyNow) {
      _storeById[c.id] = c.copyWith(
        updatedAt: DateTime.now(),
        extra: {
          ...c.extra,
          'lastNotifiedAt': t0.toIso8601String(),
        },
      );
    }

    await _persist();

    return EConcertsRefreshResult(
      upcomingSuggested: upcomingSuggested,
      shouldNotifyNow: shouldNotifyNow,
      refreshedAt: t0,
    );
  }
// ============================
// econcerts_service.dart (PART 3/4)
// ============================

  bool _recentlyNotified(Concert c, {required DateTime now}) {
    final raw = c.extra['lastNotifiedAt'];
    if (raw is! String) return false;

    try {
      final last = DateTime.parse(raw);
      final diff = now.difference(last);
      return diff.inHours < 24;
    } catch (_) {
      return false;
    }
  }

  Concert _createSuggestedConcertFromMock(Map<String, dynamic> e) {
    final artist = e['artist'] as String;
    final city = e['city'] as String;
    final country = e['countryCode'] as String;
    final venue = e['venue'] as String;
    final dt = e['startDateTimeLocal'] as DateTime;
    final url = e['url'] as String?;

    return Concert.suggested(
      source: ConcertSource.manual,
      artistName: artist,
      city: city,
      countryCode: country,
      venueName: venue,
      startDateTimeLocal: dt,
      interestScore: 0,
      priorityScore: 0,
      url: url,
      lineup: e['lineup'] as String?,
      notes: e['notes'] as String?,
      extra: {
        'mockId': e['id'],
      },
    );
  }

  List<Map<String, dynamic>> _mockEvents({required DateTime now}) {
    DateTime dayPlus(int days, {int hour = 20, int minute = 0}) {
      final d = now.add(Duration(days: days));
      return DateTime(d.year, d.month, d.day, hour, minute);
    }

    return [
      {
        'id': 'm1',
        'artist': 'Metallica',
        'city': 'Utrecht',
        'countryCode': 'NL',
        'venue': 'Jaarbeurs',
        'startDateTimeLocal': dayPlus(12, hour: 21),
        'url': null,
        'lineup': 'Metallica',
        'notes': 'Mock event',
      },
      {
        'id': 'm2',
        'artist': 'Amenra',
        'city': 'Amsterdam',
        'countryCode': 'NL',
        'venue': 'Paradiso',
        'startDateTimeLocal': dayPlus(5, hour: 20),
        'url': null,
        'lineup': 'Amenra',
        'notes': 'Mock event',
      },
      {
        'id': 'm3',
        'artist': 'Mono',
        'city': 'Rotterdam',
        'countryCode': 'NL',
        'venue': 'Rotown',
        'startDateTimeLocal': dayPlus(18, hour: 19),
        'url': null,
        'lineup': 'Mono',
        'notes': 'Mock event',
      },
      {
        'id': 'm4',
        'artist': 'Sólstafir',
        'city': 'Utrecht',
        'countryCode': 'NL',
        'venue': 'TivoliVredenburg',
        'startDateTimeLocal': dayPlus(2, hour: 21),
        'url': null,
        'lineup': 'Sólstafir',
        'notes': 'Mock event',
      },
      {
        'id': 'm5',
        'artist': 'Random Indie Band',
        'city': 'Den Haag',
        'countryCode': 'NL',
        'venue': 'Paard',
        'startDateTimeLocal': dayPlus(9, hour: 20),
        'url': null,
        'lineup': 'Random Indie Band',
        'notes': 'Should likely be ignored',
      },
    ];
  }
// ============================
// econcerts_service.dart (PART 4/4)
// ============================

  static int _byDateAsc(Concert a, Concert b) =>
      a.startDateTimeLocal.compareTo(b.startDateTimeLocal);

  static int _byPriorityDescThenDateAsc(Concert a, Concert b) {
    final p = b.priorityScore.compareTo(a.priorityScore);
    if (p != 0) return p;
    return a.startDateTimeLocal.compareTo(b.startDateTimeLocal);
  }
}
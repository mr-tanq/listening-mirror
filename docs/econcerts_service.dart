// ============================
// econcerts_service.dart (PART 1/4)
// Full file (delete & paste)
// ============================

import 'concert_model.dart';
import 'schedule_checker.dart';
import 'concert_matcher.dart';

/// Result object returned by refresh().
class EConcertsRefreshResult {
  final List<Concert> upcomingSuggested; // sorted by priority
  final List<Concert> shouldNotifyNow;   // subset worth notifying
  final DateTime refreshedAt;

  const EConcertsRefreshResult({
    required this.upcomingSuggested,
    required this.shouldNotifyNow,
    required this.refreshedAt,
  });
}

/// EConcertsService: orchestrates fetching, schedule enrichment, scoring, sorting.
/// v1: mock data instead of Songkick.
class EConcertsService {
  final ConcertMatcher matcher;

  /// Keeps a very small in-memory "memory" (v1).
  /// In v2 we’ll persist to local DB (Hive/SQLite/etc).
  final Map<String, Concert> _storeById = {};

  EConcertsService({ConcertMatcher? matcher})
      : matcher = matcher ?? const ConcertMatcher();

  /// Public: returns all stored concerts (any status)
  List<Concert> get allStored =>
      _storeById.values.toList()..sort(_byDateAsc);

  /// Public: your plan (things you added)
  List<Concert> get myPlan {
    final list = _storeById.values
        .where((c) => c.status == ConcertStatus.planned)
        .toList();
    list.sort(_byDateAsc);
    return list;
  }

  /// Public: suggestions (not dismissed, upcoming)
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

  /// Add to plan (user tapped "Add to my plan")
  void addToPlan(String concertId) {
    final c = _storeById[concertId];
    if (c == null) return;
    _storeById[concertId] = c.copyWith(
      status: ConcertStatus.planned,
      updatedAt: DateTime.now(),
    );
  }

  /// Dismiss (user tapped "Not interested")
  void dismiss(String concertId) {
    final c = _storeById[concertId];
    if (c == null) return;
    _storeById[concertId] = c.copyWith(
      status: ConcertStatus.dismissed,
      updatedAt: DateTime.now(),
    );
  }
// ============================
// econcerts_service.dart (PART 2/4)
// ============================

  /// The main entry point:
  /// - fetch events (mock in v1)
  /// - create Concert objects
  /// - enrich schedule
  /// - score with listening profile
  /// - store/update memory
  /// - return sorted suggestions + notify decisions
  EConcertsRefreshResult refresh({
    required ListeningProfile profile,
    DateTime? now,
  }) {
    final t0 = now ?? DateTime.now();

    // 1) Fetch raw events (mock)
    final raw = _mockEvents(now: t0);

    // 2) Convert to Concert + enrich schedule + score
    final List<Concert> processed = [];
    for (final e in raw) {
      final concert = _createSuggestedConcertFromMock(e);

      // schedule
      final enriched = enrichConcertWithSchedule(concert);

      // score
      final scored = matcher.scoreConcert(concert: enriched, profile: profile);

      processed.add(scored);
    }

    // 3) Merge into store (memory)
    for (final c in processed) {
      final existing = _storeById[c.id];

      if (existing == null) {
        // new item
        _storeById[c.id] = c;
      } else {
        // keep user's intent (planned/dismissed) if already set
        final keepStatus = existing.status;
        _storeById[c.id] = c.copyWith(
          status: keepStatus,
          createdAt: existing.createdAt,
          updatedAt: DateTime.now(),
        );
      }
    }

    // 4) Build result lists
    final upcomingSuggested = suggestions;

    final shouldNotifyNow = upcomingSuggested
        .where((c) => matcher.shouldNotify(c))
        .where((c) => !_recentlyNotified(c, now: t0))
        .toList();

    // Mark notify timestamp in memory so we don’t spam
    for (final c in shouldNotifyNow) {
      _storeById[c.id] = c.copyWith(
        updatedAt: DateTime.now(),
        extra: {
          ...c.extra,
          'lastNotifiedAt': t0.toIso8601String(),
        },
      );
    }

    return EConcertsRefreshResult(
      upcomingSuggested: upcomingSuggested,
      shouldNotifyNow: shouldNotifyNow,
      refreshedAt: t0,
    );
  }

  /// Anti-spam: do not notify again if we notified within last N hours.
  bool _recentlyNotified(Concert c, {required DateTime now}) {
    final raw = c.extra['lastNotifiedAt'];
    if (raw is! String) return false;

    try {
      final last = DateTime.parse(raw);
      final diff = now.difference(last);
      return diff.inHours < 24; // configurable later
    } catch (_) {
      return false;
    }
  }
// ============================
// econcerts_service.dart (PART 3/4)
// ============================

  /// Creates a Concert from our mock event map.
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
      interestScore: 0,  // will be filled by matcher
      priorityScore: 0,  // will be filled by matcher
      url: url,
      lineup: e['lineup'] as String?,
      notes: e['notes'] as String?,
      extra: {
        'mockId': e['id'],
      },
    );
  }

  /// Mock events generator.
  /// Replace with Songkick fetching later.
  List<Map<String, dynamic>> _mockEvents({required DateTime now}) {
    // We generate a handful of future events relative to "now"
    // so you can test the pipeline immediately.
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
        'notes': 'Mock event for testing notifications',
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
        'notes': 'Should likely be ignored unless in profile',
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
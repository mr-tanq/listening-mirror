// ============================
// concert_model.dart (PART 1/4)
// Delete & paste entire file
// ============================

import 'dart:convert';

/// Where did this event come from?
enum ConcertSource {
  songkick,
  manual,
}

/// Our internal status for the event lifecycle.
enum ConcertStatus {
  /// Found by the system and suggested to you.
  suggested,

  /// You tapped "Add to My Plan".
  planned,

  /// You explicitly declined it (we should not nag).
  dismissed,

  /// Event date passed.
  completed,
}

/// How easy is it to attend based on your shift schedule + timing.
enum AvailabilityBadge {
  easy, // green
  possible, // yellow
  hard, // orange
  requiresLeave, // red
  unknown,
}

enum ShiftType {
  morning,
  afternoon,
  night,
  off,
  unknown,
}

/// A single concert/live event.
/// This is the core model that the rest of eConcerts will build upon.
class Concert {
  final String id; // stable internal id (we'll build it deterministically)
  final ConcertSource source;

  // Core event info
  final String artistName;
  final String city;
  final String countryCode; // e.g. "NL"
  final String venueName;
  final DateTime startDateTimeLocal; // local time of event in NL (or event location)
  final String? url; // Songkick or ticket link (optional)

  // Scoring (0..100)
  final int interestScore; // how much it matches your taste/listening
  final int priorityScore; // overall importance (interest + rarity + etc.) later

  // Schedule intelligence
  final ShiftType shiftType; // inferred for that date from your 10-day cycle
  final AvailabilityBadge availabilityBadge;

  // User intent + learning
  final ConcertStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;

  // Optional metadata for future use
  final String? lineup; // "Artist + Support1 + Support2"
  final String? notes; // quick note, e.g. "watch for presale"
  final Map<String, dynamic> extra; // safe space for future fields

  const Concert({
    required this.id,
    required this.source,
    required this.artistName,
    required this.city,
    required this.countryCode,
    required this.venueName,
    required this.startDateTimeLocal,
    required this.interestScore,
    required this.priorityScore,
    required this.shiftType,
    required this.availabilityBadge,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.url,
    this.lineup,
    this.notes,
    this.extra = const {},
  });
// ============================
// concert_model.dart (PART 2/4)
// ============================

  /// Convenience: "Utrecht • TivoliVredenburg"
  String get locationLabel => '$city • $venueName';

  /// True if the event is in the future (vs now).
  bool get isUpcoming => startDateTimeLocal.isAfter(DateTime.now());

  Concert copyWith({
    String? id,
    ConcertSource? source,
    String? artistName,
    String? city,
    String? countryCode,
    String? venueName,
    DateTime? startDateTimeLocal,
    String? url,
    int? interestScore,
    int? priorityScore,
    ShiftType? shiftType,
    AvailabilityBadge? availabilityBadge,
    ConcertStatus? status,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? lineup,
    String? notes,
    Map<String, dynamic>? extra,
  }) {
    return Concert(
      id: id ?? this.id,
      source: source ?? this.source,
      artistName: artistName ?? this.artistName,
      city: city ?? this.city,
      countryCode: countryCode ?? this.countryCode,
      venueName: venueName ?? this.venueName,
      startDateTimeLocal: startDateTimeLocal ?? this.startDateTimeLocal,
      url: url ?? this.url,
      interestScore: interestScore ?? this.interestScore,
      priorityScore: priorityScore ?? this.priorityScore,
      shiftType: shiftType ?? this.shiftType,
      availabilityBadge: availabilityBadge ?? this.availabilityBadge,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      lineup: lineup ?? this.lineup,
      notes: notes ?? this.notes,
      extra: extra ?? this.extra,
    );
  }

  /// Minimal deterministic id builder (no crypto; stable enough).
  /// We can evolve later if Songkick gives a stable event id.
  static String buildId({
    required String artistName,
    required String city,
    required String venueName,
    required DateTime startDateTimeLocal,
    required ConcertSource source,
  }) {
    final normalized = [
      source.name,
      _norm(artistName),
      _norm(city),
      _norm(venueName),
      startDateTimeLocal.toIso8601String(),
    ].join('|');
    // Simple hash-like using base64 of utf8; stable & short-ish.
    return base64Url.encode(utf8.encode(normalized)).replaceAll('=', '');
  }

  static String _norm(String s) =>
      s.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'source': source.name,
      'artistName': artistName,
      'city': city,
      'countryCode': countryCode,
      'venueName': venueName,
      'startDateTimeLocal': startDateTimeLocal.toIso8601String(),
      'url': url,
      'interestScore': interestScore,
      'priorityScore': priorityScore,
      'shiftType': shiftType.name,
      'availabilityBadge': availabilityBadge.name,
      'status': status.name,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
      'lineup': lineup,
      'notes': notes,
      'extra': extra,
    };
  }
// ============================
// concert_model.dart (PART 3/4)
// ============================

  static Concert fromJson(Map<String, dynamic> json) {
    DateTime _dt(String key) => DateTime.parse(json[key] as String);

    return Concert(
      id: json['id'] as String,
      source: _parseEnum(ConcertSource.values, json['source']),
      artistName: json['artistName'] as String,
      city: json['city'] as String,
      countryCode: json['countryCode'] as String,
      venueName: json['venueName'] as String,
      startDateTimeLocal: _dt('startDateTimeLocal'),
      url: json['url'] as String?,
      interestScore: (json['interestScore'] as num).toInt(),
      priorityScore: (json['priorityScore'] as num).toInt(),
      shiftType: _parseEnum(ShiftType.values, json['shiftType']),
      availabilityBadge:
          _parseEnum(AvailabilityBadge.values, json['availabilityBadge']),
      status: _parseEnum(ConcertStatus.values, json['status']),
      createdAt: _dt('createdAt'),
      updatedAt: _dt('updatedAt'),
      lineup: json['lineup'] as String?,
      notes: json['notes'] as String?,
      extra: (json['extra'] as Map?)?.cast<String, dynamic>() ?? const {},
    );
  }

  /// Safety: clamp scores to 0..100 when constructing via factory.
  static int clampScore(num v) {
    final i = v.toInt();
    if (i < 0) return 0;
    if (i > 100) return 100;
    return i;
  }

  /// Useful factory for quickly creating a "suggested" concert.
  factory Concert.suggested({
    required ConcertSource source,
    required String artistName,
    required String city,
    required String countryCode,
    required String venueName,
    required DateTime startDateTimeLocal,
    required int interestScore,
    required int priorityScore,
    ShiftType shiftType = ShiftType.unknown,
    AvailabilityBadge availabilityBadge = AvailabilityBadge.unknown,
    String? url,
    String? lineup,
    String? notes,
    Map<String, dynamic> extra = const {},
  }) {
    final now = DateTime.now();
    final id = Concert.buildId(
      artistName: artistName,
      city: city,
      venueName: venueName,
      startDateTimeLocal: startDateTimeLocal,
      source: source,
    );

    return Concert(
      id: id,
      source: source,
      artistName: artistName,
      city: city,
      countryCode: countryCode,
      venueName: venueName,
      startDateTimeLocal: startDateTimeLocal,
      url: url,
      interestScore: clampScore(interestScore),
      priorityScore: clampScore(priorityScore),
      shiftType: shiftType,
      availabilityBadge: availabilityBadge,
      status: ConcertStatus.suggested,
      createdAt: now,
      updatedAt: now,
      lineup: lineup,
      notes: notes,
      extra: extra,
    );
  }
// ============================
// concert_model.dart (PART 4/4)
// ============================

  @override
  String toString() {
    return 'Concert('
        'id=$id, artist=$artistName, city=$city, venue=$venueName, '
        'start=$startDateTimeLocal, interest=$interestScore, priority=$priorityScore, '
        'shift=${shiftType.name}, badge=${availabilityBadge.name}, status=${status.name}'
        ')';
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Concert && other.id == id);

  @override
  int get hashCode => id.hashCode;
}

/// Generic enum parser with good errors.
T _parseEnum<T>(List<T> values, dynamic raw) {
  final s = raw?.toString();
  for (final v in values) {
    // Works for enums because v.toString() == 'EnumType.value'
    // and v.name is available in modern Dart.
    if (v is dynamic && (v as dynamic).name == s) return v;
  }
  // Fallback: allow 'EnumType.value'
  for (final v in values) {
    if (v.toString() == s) return v;
  }
  throw FormatException('Invalid enum value: $raw');
}
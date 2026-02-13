// ============================
// concert_matcher.dart (PART 1/4)
// Full file (delete & paste)
// ============================

import 'concert_model.dart';

enum MatchTier {
  mustGo,
  strongMatch,
  rediscovery,
  discovery,
  ignore,
}

class MatchConfig {
  final int mustGoPlays;
  final int strongMatchPlays;
  final int rediscoveryPlays;

  final int notifyMinScore;
  final int notifyMinScoreEasyDay;
  final bool allowDiscoveryNotifs;

  final int easyBonus;
  final int possibleBonus;
  final int hardPenalty;
  final int leavePenalty;

  const MatchConfig({
    this.mustGoPlays = 120,
    this.strongMatchPlays = 35,
    this.rediscoveryPlays = 5,
    this.notifyMinScore = 70,
    this.notifyMinScoreEasyDay = 60,
    this.allowDiscoveryNotifs = false,
    this.easyBonus = 8,
    this.possibleBonus = 3,
    this.hardPenalty = 10,
    this.leavePenalty = 18,
  });
}

class ListeningProfile {
  final Map<String, int> artistPlays;

  const ListeningProfile({required this.artistPlays});

  int playsFor(String artistName) {
    final key = _norm(artistName);
    if (artistPlays.containsKey(key)) return artistPlays[key] ?? 0;
    return artistPlays[artistName] ?? 0;
  }

  static String _norm(String s) =>
      s.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
}
// ============================
// concert_matcher.dart (PART 2/4)
// ============================

class ConcertMatcher {
  final MatchConfig config;

  const ConcertMatcher({this.config = const MatchConfig()});

  MatchTier tierForPlays(int plays) {
    if (plays >= config.mustGoPlays) return MatchTier.mustGo;
    if (plays >= config.strongMatchPlays) return MatchTier.strongMatch;
    if (plays >= config.rediscoveryPlays) return MatchTier.rediscovery;
    if (plays > 0) return MatchTier.discovery;
    return MatchTier.ignore;
  }

  int baseScoreFromPlays(int plays) {
    if (plays <= 0) return 0;

    if (plays < config.rediscoveryPlays) {
      return _clamp((plays * 7) + 8);
    }

    if (plays < config.strongMatchPlays) {
      final span = config.strongMatchPlays - config.rediscoveryPlays;
      final pos = plays - config.rediscoveryPlays;
      final score = 35 + ((pos / span) * 34);
      return _clamp(score.round());
    }

    if (plays < config.mustGoPlays) {
      final span = config.mustGoPlays - config.strongMatchPlays;
      final pos = plays - config.strongMatchPlays;
      final score = 70 + ((pos / span) * 22);
      return _clamp(score.round());
    }

    final extra = plays - config.mustGoPlays;
    final score = 92 + (extra / 130) * 8;
    return _clamp(score.round());
  }

  int applyAvailabilityWeight({
    required int baseScore,
    required AvailabilityBadge badge,
  }) {
    int score = baseScore;

    switch (badge) {
      case AvailabilityBadge.easy:
        score += config.easyBonus;
        break;
      case AvailabilityBadge.possible:
        score += config.possibleBonus;
        break;
      case AvailabilityBadge.hard:
        score -= config.hardPenalty;
        break;
      case AvailabilityBadge.requiresLeave:
        score -= config.leavePenalty;
        break;
      default:
        break;
    }

    return _clamp(score);
  }
// ============================
// concert_matcher.dart (PART 3/4)
// ============================

  Concert scoreConcert({
    required Concert concert,
    required ListeningProfile profile,
  }) {
    final plays = profile.playsFor(concert.artistName);

    final base = baseScoreFromPlays(plays);
    final weighted = applyAvailabilityWeight(
      baseScore: base,
      badge: concert.availabilityBadge,
    );

    final priority = weighted;

    return concert.copyWith(
      interestScore: weighted,
      priorityScore: priority,
      updatedAt: DateTime.now(),
      extra: {
        ...concert.extra,
        'plays': plays,
        'tier': tierForPlays(plays).name,
        'baseScore': base,
      },
    );
  }

  bool shouldNotify(Concert concert) {
    final tierName = (concert.extra['tier'] ?? '').toString();
    final tier = _parseTier(tierName);

    if (tier == MatchTier.ignore) return false;
    if (!config.allowDiscoveryNotifs && tier == MatchTier.discovery) return false;

    final score = concert.interestScore;
    final badge = concert.availabilityBadge;

    if (badge == AvailabilityBadge.easy && score >= config.notifyMinScoreEasyDay) {
      return true;
    }
    return score >= config.notifyMinScore;
  }

  String tierLabel(MatchTier tier) {
    switch (tier) {
      case MatchTier.mustGo:
        return "MUST GO";
      case MatchTier.strongMatch:
        return "Strong match";
      case MatchTier.rediscovery:
        return "Rediscovery";
      case MatchTier.discovery:
        return "Discovery";
      case MatchTier.ignore:
        return "Ignore";
    }
  }

  static int _clamp(int v) {
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  static MatchTier _parseTier(String s) {
    for (final t in MatchTier.values) {
      if (t.name == s) return t;
    }
    return MatchTier.ignore;
  }
}
// ============================
// concert_matcher.dart (PART 4/4)
// ============================

String buildConcertNotificationTitle(Concert c) {
  return "${c.artistName} — ${c.city}";
}

String buildConcertNotificationBody(Concert c, ConcertMatcher matcher) {
  final tierName = (c.extra['tier'] ?? '').toString();
  final tier = ConcertMatcher._parseTier(tierName);

  final shiftInfo = _shiftSummary(c.shiftType, c.availabilityBadge);

  return "${matcher.tierLabel(tier)} • $shiftInfo";
}

String _shiftSummary(ShiftType shift, AvailabilityBadge badge) {
  final shiftText = _shiftLabel(shift);
  final badgeText = _badgeShort(badge);
  return "$shiftText — $badgeText";
}

String _shiftLabel(ShiftType shift) {
  switch (shift) {
    case ShiftType.off:
      return "Off";
    case ShiftType.morning:
      return "Morning (07:00–15:00)";
    case ShiftType.afternoon:
      return "Afternoon (15:00–23:00)";
    case ShiftType.night:
      return "Night (23:00–07:00)";
    default:
      return "Unknown";
  }
}

String _badgeShort(AvailabilityBadge badge) {
  switch (badge) {
    case AvailabilityBadge.easy:
      return "🟢 Easy";
    case AvailabilityBadge.possible:
      return "🟡 Possible";
    case AvailabilityBadge.hard:
      return "🟠 Hard";
    case AvailabilityBadge.requiresLeave:
      return "🔴 Needs leave";
    default:
      return "❔";
  }
}
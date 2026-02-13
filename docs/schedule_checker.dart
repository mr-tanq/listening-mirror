// ============================
// schedule_checker.dart (PART 1/4)
// ============================

import 'concert_model.dart';

/// Reference date:
/// 18 October 2025 = Day 1 of the cycle = OFF
final DateTime referenceDate = DateTime(2025, 10, 18);

/// Returns number of calendar days between two dates (date only, not time)
int _daysBetween(DateTime a, DateTime b) {
  final da = DateTime(a.year, a.month, a.day);
  final db = DateTime(b.year, b.month, b.day);
  return db.difference(da).inDays;
}

/// Normalize modulo for negative numbers
int _mod(int value, int modulo) {
  final r = value % modulo;
  return r < 0 ? r + modulo : r;
}

/// Main function: what shift do you work on a given date?
ShiftType getShiftForDate(DateTime date) {
  final delta = _daysBetween(referenceDate, date);
  final index = _mod(delta, 10);

  // Cycle:
  // 0 Off
  // 1 Off
  // 2 Off
  // 3 Off
  // 4 Morning
  // 5 Morning
  // 6 Afternoon
  // 7 Afternoon
  // 8 Night
  // 9 Night

  if (index <= 3) return ShiftType.off;
  if (index <= 5) return ShiftType.morning;
  if (index <= 7) return ShiftType.afternoon;
  return ShiftType.night;
}
// ============================
// schedule_checker.dart (PART 2/4)
// ============================

/// Converts shift to human-readable label (for notifications later)
String shiftLabel(ShiftType shift) {
  switch (shift) {
    case ShiftType.off:
      return "Ρεπό";
    case ShiftType.morning:
      return "Πρωινή (07:00–15:00)";
    case ShiftType.afternoon:
      return "Απογευματινή (15:00–23:00)";
    case ShiftType.night:
      return "Νυχτερινή (23:00–07:00)";
    default:
      return "Άγνωστο";
  }
}

/// Core logic:
/// Determines how feasible it is to attend a concert
AvailabilityBadge getAvailabilityBadge({
  required DateTime concertDateTime,
}) {
  final shift = getShiftForDate(concertDateTime);

  final concertHour = concertDateTime.hour;

  switch (shift) {
    case ShiftType.off:
      return AvailabilityBadge.easy;

    case ShiftType.morning:
      // finish 15:00 → evening concerts fine
      if (concertHour >= 18) return AvailabilityBadge.easy;
      return AvailabilityBadge.possible;

    case ShiftType.afternoon:
      // working 15:00–23:00
      if (concertHour < 15) return AvailabilityBadge.possible;
      return AvailabilityBadge.hard;

    case ShiftType.night:
      // working 23:00–07:00
      // even 20:00 concert is risky
      if (concertHour <= 18) return AvailabilityBadge.hard;
      return AvailabilityBadge.requiresLeave;

    default:
      return AvailabilityBadge.unknown;
  }
}
// ============================
// schedule_checker.dart (PART 3/4)
// ============================

/// Helper for UI badges later
String availabilityText(AvailabilityBadge badge) {
  switch (badge) {
    case AvailabilityBadge.easy:
      return "🟢 Πολύ εύκολο να πας";
    case AvailabilityBadge.possible:
      return "🟡 Πιθανό";
    case AvailabilityBadge.hard:
      return "🟠 Δύσκολο";
    case AvailabilityBadge.requiresLeave:
      return "🔴 Θέλει άδεια";
    default:
      return "Άγνωστο";
  }
}

/// This will be used in push notifications
String buildPlanningMessage(DateTime concertDateTime) {
  final shift = getShiftForDate(concertDateTime);
  final badge = getAvailabilityBadge(concertDateTime: concertDateTime);

  return "${shiftLabel(shift)} — ${availabilityText(badge)}";
}
// ============================
// schedule_checker.dart (PART 4/4)
// ============================

/// Quick utility:
/// enrich a Concert with shift + availability
Concert enrichConcertWithSchedule(Concert concert) {
  final shift = getShiftForDate(concert.startDateTimeLocal);
  final badge = getAvailabilityBadge(
    concertDateTime: concert.startDateTimeLocal,
  );

  return concert.copyWith(
    shiftType: shift,
    availabilityBadge: badge,
    updatedAt: DateTime.now(),
  );
}
// ============================
// schedule_checker.dart (PART 1/4)
// Full file (delete & paste)
// ============================

import 'concert_model.dart';

/// Reference date:
/// 18 Oct 2025 = Day 1 of the 10-day cycle = OFF (first day off)
final DateTime referenceDate = DateTime(2025, 10, 18);

/// Returns number of calendar days between two dates (date-only, ignores time)
int _daysBetween(DateTime a, DateTime b) {
  final da = DateTime(a.year, a.month, a.day);
  final db = DateTime(b.year, b.month, b.day);
  return db.difference(da).inDays;
}

/// Safe modulo for negative numbers
int _mod(int value, int modulo) {
  final r = value % modulo;
  return r < 0 ? r + modulo : r;
}

/// Cycle index: 0..9
/// 0 = Off day 1
/// 1 = Off day 2
/// 2 = Off day 3
/// 3 = Off day 4 (LAST off day)
/// 4 = Morning shift 1 (07:00–15:00)
/// 5 = Morning shift 2 (07:00–15:00)  <-- special rule
/// 6 = Afternoon shift 1 (15:00–23:00)
/// 7 = Afternoon shift 2 (15:00–23:00)
/// 8 = Night shift 1 (23:00–07:00)
/// 9 = Night shift 2 (23:00–07:00)
int getCycleIndex(DateTime date) {
  final delta = _daysBetween(referenceDate, date);
  return _mod(delta, 10);
}

/// What shift do you work on a given date?
ShiftType getShiftForDate(DateTime date) {
  final index = getCycleIndex(date);

  if (index <= 3) return ShiftType.off;
  if (index <= 5) return ShiftType.morning;
  if (index <= 7) return ShiftType.afternoon;
  return ShiftType.night;
}
// ============================
// schedule_checker.dart (PART 2/4)
// ============================

/// Human labels (English) for UI/notifications
String shiftLabel(ShiftType shift) {
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

/// Availability badge based on shift + time + special “next-day impact” rules.
///
/// Special rules requested:
/// - LAST off day (cycleIndex == 3): late concerts are harder because next day you wake 06:00.
/// - 2nd morning shift (cycleIndex == 5): late concerts are easier because next day is afternoon shift (15:00).
AvailabilityBadge getAvailabilityBadge({
  required DateTime concertDateTime,
}) {
  final idx = getCycleIndex(concertDateTime);
  final shift = getShiftForDate(concertDateTime);
  final hour = concertDateTime.hour;

  // Helper thresholds (can tune later)
  const lateHour = 21;      // late-ish start
  const veryLateHour = 23;  // very late start

  switch (shift) {
    case ShiftType.off:
      // Off days are usually easy, BUT last off day is special.
      if (idx == 3) {
        // Last off day: if it's late, it's hard because next day is morning shift.
        if (hour >= veryLateHour) return AvailabilityBadge.requiresLeave;
        if (hour >= lateHour) return AvailabilityBadge.hard;
        return AvailabilityBadge.possible; // still doable, but not “easy”
      }
      return AvailabilityBadge.easy;

    case ShiftType.morning:
      // Morning shift days: evenings are generally doable.
      // But 2nd morning shift is easier (next day afternoon shift).
      if (idx == 5) {
        // 2nd morning: evening concerts are easier
        if (hour >= 18) return AvailabilityBadge.easy;
        return AvailabilityBadge.possible;
      } else {
        // 1st morning: you're also morning next day, so late is more tiring
        if (hour >= 22) return AvailabilityBadge.possible;
        if (hour >= 18) return AvailabilityBadge.possible;
        return AvailabilityBadge.possible;
      }

    case ShiftType.afternoon:
      // Working 15:00–23:00
      if (hour < 15) return AvailabilityBadge.possible;
      return AvailabilityBadge.hard;

    case ShiftType.night:
      // Working 23:00–07:00 (belongs to the day it starts)
      // A concert at 21:00 is basically not realistic.
      if (hour <= 18) return AvailabilityBadge.hard;
      return AvailabilityBadge.requiresLeave;

    default:
      return AvailabilityBadge.unknown;
  }
}
// ============================
// schedule_checker.dart (PART 3/4)
// ============================

String availabilityText(AvailabilityBadge badge) {
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
      return "❔ Unknown";
  }
}

/// Compact planning message (English)
String buildPlanningMessage(DateTime concertDateTime) {
  final shift = getShiftForDate(concertDateTime);
  final badge = getAvailabilityBadge(concertDateTime: concertDateTime);

  return "${shiftLabel(shift)} — ${availabilityText(badge)}";
}
// ============================
// schedule_checker.dart (PART 4/4)
// ============================

/// Enrich a Concert with computed shift + availability.
/// (Call this right after you create a Concert from Songkick / mock data.)
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
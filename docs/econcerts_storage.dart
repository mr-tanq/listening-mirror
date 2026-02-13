// ============================
// econcerts_storage.dart (PART 1/4)
// Full file (delete & paste)
// ============================

import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

import 'concert_model.dart';

class EConcertsStorage {
  static const _kStoreKey = 'econcerts_store_v1';

  /// Load stored concerts from SharedPreferences.
  /// Returns Map<id, Concert>.
  static Future<Map<String, Concert>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kStoreKey);
    if (raw == null || raw.isEmpty) return {};

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return {};

      final Map<String, Concert> out = {};
      decoded.forEach((id, value) {
        if (value is Map<String, dynamic>) {
          out[id] = Concert.fromJson(value);
        }
      });
      return out;
    } catch (_) {
      return {};
    }
  }
// ============================
// econcerts_storage.dart (PART 2/4)
// ============================

  /// Save Map<id, Concert> to SharedPreferences.
  static Future<void> save(Map<String, Concert> store) async {
    final prefs = await SharedPreferences.getInstance();

    final Map<String, dynamic> jsonMap = {};
    store.forEach((id, concert) {
      jsonMap[id] = concert.toJson();
    });

    final raw = jsonEncode(jsonMap);
    await prefs.setString(_kStoreKey, raw);
  }

  /// Clear all stored concerts (useful for debugging).
  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kStoreKey);
  }
// ============================
// econcerts_storage.dart (PART 3/4)
// ============================

  /// Export as JSON string (for debug/share)
  static Future<String> exportJson() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_kStoreKey) ?? '{}';
  }

  /// Import from JSON string (for debug/share)
  static Future<bool> importJson(String raw) async {
    final prefs = await SharedPreferences.getInstance();
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return false;
      await prefs.setString(_kStoreKey, jsonEncode(decoded));
      return true;
    } catch (_) {
      return false;
    }
  }
}
// ============================
// econcerts_storage.dart (PART 4/4)
// ============================

// End of file.
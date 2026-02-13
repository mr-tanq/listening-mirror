// ============================
// econcerts_screen.dart (PART 1/4)
// Full file (delete & paste)
// ============================

import 'package:flutter/material.dart';

import 'econcerts_service.dart';
import 'concert_model.dart';
import 'concert_matcher.dart';
import 'schedule_checker.dart';

class EConcertsScreen extends StatefulWidget {
  final EConcertsService service;

  /// Provide the listening profile from your app (Last.fm stats).
  /// For now you can pass a mock profile.
  final ListeningProfile Function() getListeningProfile;

  const EConcertsScreen({
    super.key,
    required this.service,
    required this.getListeningProfile,
  });

  @override
  State<EConcertsScreen> createState() => _EConcertsScreenState();
}

class _EConcertsScreenState extends State<EConcertsScreen> {
  EConcertsRefreshResult? _lastResult;
  bool _loading = false;

  bool _groupByCity = true;

  @override
  void initState() {
    super.initState();
    _refresh(); // auto refresh on open
  }

  Future<void> _refresh() async {
    if (_loading) return;
    setState(() => _loading = true);

    try {
      final profile = widget.getListeningProfile();
      final result = widget.service.refresh(profile: profile);
      setState(() => _lastResult = result);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final suggested = _lastResult?.upcomingSuggested ?? widget.service.suggestions;
    final myPlan = widget.service.myPlan;

    return Scaffold(
      appBar: AppBar(
        title: const Text('eConcerts'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _refresh,
            icon: _loading
                ? const SizedBox(
                    width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: _groupByCity ? 'Ungroup' : 'Group by city',
            onPressed: () => setState(() => _groupByCity = !_groupByCity),
            icon: Icon(_groupByCity ? Icons.location_city : Icons.list),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _sectionHeader('My Plan', subtitle: 'Events you added'),
          if (myPlan.isEmpty)
            _emptyCard('No planned events yet.', 'Tap "Add to plan" on a suggestion.'),
          if (myPlan.isNotEmpty)
            ..._buildConcertList(
              concerts: myPlan,
              isPlan: true,
              groupByCity: _groupByCity,
            ),

          const SizedBox(height: 14),

          _sectionHeader('Upcoming', subtitle: 'Suggested for you'),
          if (suggested.isEmpty)
            _emptyCard('No suggestions yet.', 'Try refresh.'),
          if (suggested.isNotEmpty)
            ..._buildConcertList(
              concerts: suggested,
              isPlan: false,
              groupByCity: _groupByCity,
            ),
        ],
      ),
    );
  }
// ============================
// econcerts_screen.dart (PART 2/4)
// ============================

  Widget _sectionHeader(String title, {String? subtitle}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          if (subtitle != null) ...[
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                subtitle,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _emptyCard(String title, String subtitle) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(subtitle, style: TextStyle(color: Colors.grey.shade700)),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildConcertList({
    required List<Concert> concerts,
    required bool isPlan,
    required bool groupByCity,
  }) {
    if (!groupByCity) {
      return concerts.map((c) => _concertCard(c, isPlan: isPlan)).toList();
    }

    final Map<String, List<Concert>> byCity = {};
    for (final c in concerts) {
      byCity.putIfAbsent(c.city, () => []).add(c);
    }

    final cities = byCity.keys.toList()..sort();
    return cities.map((city) {
      final items = byCity[city]!..sort((a, b) => a.startDateTimeLocal.compareTo(b.startDateTimeLocal));
      return Card(
        child: ExpansionTile(
          title: Text(city, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text('${items.length} event(s)'),
          children: [
            for (final c in items) _concertCard(c, isPlan: isPlan, isNested: true),
          ],
        ),
      );
    }).toList();
  }

  Widget _pill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: Colors.grey.shade200,
      ),
      child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }

  String _dateLine(DateTime dt) {
    // Simple EN format without intl package.
    final y = dt.year.toString().padLeft(4, '0');
    final m = dt.month.toString().padLeft(2, '0');
    final d = dt.day.toString().padLeft(2, '0');
    final hh = dt.hour.toString().padLeft(2, '0');
    final mm = dt.minute.toString().padLeft(2, '0');
    return '$y-$m-$d • $hh:$mm';
  }
// ============================
// econcerts_screen.dart (PART 3/4)
// ============================

  Widget _concertCard(Concert c, {required bool isPlan, bool isNested = false}) {
    final tier = (c.extra['tier'] ?? 'unknown').toString();
    final plays = (c.extra['plays'] ?? 0).toString();
    final baseScore = (c.extra['baseScore'] ?? 0).toString();

    final planning = buildPlanningMessage(c.startDateTimeLocal); // English
    final badge = availabilityText(c.availabilityBadge);         // English

    final titleStyle = TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w800,
      height: 1.1,
      color: Colors.grey.shade900,
    );

    final subtitleStyle = TextStyle(color: Colors.grey.shade700);

    final cardChild = Padding(
      padding: EdgeInsets.fromLTRB(14, 12, 14, isNested ? 12 : 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(c.artistName, style: titleStyle),
          const SizedBox(height: 6),

          Text('${_dateLine(c.startDateTimeLocal)}  •  ${c.locationLabel}', style: subtitleStyle),
          const SizedBox(height: 10),

          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _pill('Score: ${c.priorityScore}/100'),
              _pill('Tier: $tier'),
              _pill('Plays: $plays'),
              _pill('Base: $baseScore'),
              _pill(planning),
              _pill(badge),
            ],
          ),

          const SizedBox(height: 12),

          Row(
            children: [
              if (!isPlan) ...[
                ElevatedButton.icon(
                  onPressed: () {
                    widget.service.addToPlan(c.id);
                    setState(() {});
                  },
                  icon: const Icon(Icons.add),
                  label: const Text('Add to plan'),
                ),
                const SizedBox(width: 10),
                OutlinedButton.icon(
                  onPressed: () {
                    widget.service.dismiss(c.id);
                    setState(() {});
                  },
                  icon: const Icon(Icons.close),
                  label: const Text('Dismiss'),
                ),
              ] else ...[
                OutlinedButton.icon(
                  onPressed: () {
                    widget.service.dismiss(c.id);
                    setState(() {});
                  },
                  icon: const Icon(Icons.remove_circle_outline),
                  label: const Text('Remove'),
                ),
              ],
              const Spacer(),
              if (c.url != null && c.url!.isNotEmpty)
                IconButton(
                  tooltip: 'Open link',
                  onPressed: () {
                    // For now: just show the URL in a snackbar.
                    // Later: use url_launcher.
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(c.url!)),
                    );
                  },
                  icon: const Icon(Icons.link),
                ),
            ],
          ),
        ],
      ),
    );

    if (isNested) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        child: Card(child: cardChild),
      );
    }

    return Card(child: cardChild);
  }
}
// ============================
// econcerts_screen.dart (PART 4/4)
// ============================

// End of file.
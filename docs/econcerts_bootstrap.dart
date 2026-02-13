import 'package:flutter/material.dart';

import 'econcerts_service.dart';
import 'econcerts_screen.dart';
import 'concert_matcher.dart';

class EConcertsBootstrap extends StatefulWidget {
  const EConcertsBootstrap({super.key});

  @override
  State<EConcertsBootstrap> createState() => _EConcertsBootstrapState();
}

class _EConcertsBootstrapState extends State<EConcertsBootstrap> {
  final EConcertsService _service = EConcertsService();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _service.init(); // loads stored memory (plan/dismiss/notify timestamps)
    if (mounted) setState(() => _ready = true);
  }

  // TODO: replace this with your real Last.fm profile mapping later.
  ListeningProfile _mockProfile() {
    return const ListeningProfile(
      artistPlays: {
        'metallica': 200,
        'amenra': 150,
        'mono': 90,
        'sólstafir': 60,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return EConcertsScreen(
      service: _service,
      getListeningProfile: _mockProfile,
    );
  }
}
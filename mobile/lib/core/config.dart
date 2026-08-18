import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode;

/// Default vault API base URL for each platform.
class AppConfig {
  /// Optional build-time override:
  ///   flutter run --dart-define=VAULT_API_BASE=http://192.168.0.103:8787
  static const String dartDefineApiBase = String.fromEnvironment(
    'VAULT_API_BASE',
    defaultValue: '',
  );

  /// Prefer LAN IP for physical devices; override in Settings / Login.
  static String get defaultApiBase {
    if (dartDefineApiBase.trim().isNotEmpty) {
      return normalizeBase(dartDefineApiBase);
    }
    if (kIsWeb) return 'http://127.0.0.1:8787';
    try {
      if (Platform.isAndroid) {
        // Android emulator → host machine. Physical Android needs LAN IP.
        if (isAndroidEmulator) return 'http://10.0.2.2:8787';
        return 'http://127.0.0.1:8787'; // force user to set LAN on device
      }
      if (Platform.isIOS) {
        // Simulator can reach Mac localhost; real iPhone cannot.
        if (isIOSSimulator) return 'http://127.0.0.1:8787';
        return 'http://127.0.0.1:8787'; // login screen forces LAN IP entry
      }
    } catch (_) {}
    return 'http://127.0.0.1:8787';
  }

  /// True when the URL points at this device's loopback (won't reach Mac from phone).
  static bool isLoopbackBase(String raw) {
    final u = Uri.tryParse(normalizeBase(raw));
    if (u == null) return false;
    final h = u.host.toLowerCase();
    return h == '127.0.0.1' ||
        h == 'localhost' ||
        h == '::1' ||
        h == '0.0.0.0' ||
        h == '10.0.2.2'; // emulator-only
  }

  /// Real iPhone / iPad (not Simulator).
  static bool get isPhysicalIOS {
    if (kIsWeb) return false;
    try {
      if (!Platform.isIOS) return false;
      return !isIOSSimulator;
    } catch (_) {
      return false;
    }
  }

  static bool get isPhysicalAndroid {
    if (kIsWeb) return false;
    try {
      if (!Platform.isAndroid) return false;
      return !isAndroidEmulator;
    } catch (_) {
      return false;
    }
  }

  static bool get isPhysicalMobile => isPhysicalIOS || isPhysicalAndroid;

  static bool get isIOSSimulator {
    if (kIsWeb) return false;
    try {
      if (!Platform.isIOS) return false;
      // Flutter / Xcode inject these on Simulator only
      final env = Platform.environment;
      return env.containsKey('SIMULATOR_DEVICE_NAME') ||
          env.containsKey('SIMULATOR_ROOT') ||
          env['SIMULATOR_UDID'] != null;
    } catch (_) {
      return false;
    }
  }

  static bool get isAndroidEmulator {
    if (kIsWeb) return false;
    try {
      if (!Platform.isAndroid) return false;
      // Heuristic — physical devices rarely match these
      final env = Platform.environment;
      final fp = (env['FINGERPRINT'] ?? env['ro.build.fingerprint'] ?? '')
          .toLowerCase();
      final model = (env['MODEL'] ?? '').toLowerCase();
      return fp.contains('generic') ||
          fp.contains('emulator') ||
          model.contains('sdk') ||
          model.contains('emulator');
    } catch (_) {
      return false;
    }
  }

  /// Human-readable help for connecting a phone to the Mac vault.
  static String phoneConnectionHint(String currentBase) {
    final loop = isLoopbackBase(currentBase);
    final buf = StringBuffer();
    if (isPhysicalMobile || loop) {
      buf.writeln(
        'On a real phone, 127.0.0.1 is the phone itself — not your Mac.',
      );
      buf.writeln(
        '1. Mac & phone on the same Wi‑Fi',
      );
      buf.writeln(
        '2. Vault running: cd server && npm run start',
      );
      buf.writeln(
        '3. Set API to http://YOUR_MAC_IP:8787',
      );
      buf.writeln(
        '   Find IP: System Settings → Network, or: ipconfig getifaddr en0',
      );
      if (kDebugMode) {
        buf.writeln(
          '4. Or rebuild with: --dart-define=VAULT_API_BASE=http://192.168.x.x:8787',
        );
      }
    }
    return buf.toString().trim();
  }

  static String normalizeBase(String raw) {
    var s = raw.trim();
    if (s.isEmpty) return defaultApiBase;
    if (!s.startsWith('http://') && !s.startsWith('https://')) {
      s = 'http://$s';
    }
    final uri = Uri.tryParse(s);
    if (uri != null && uri.hasScheme && uri.host.isNotEmpty) {
      // Drop userInfo/path/query so secrets never sit in the base URL
      final port = uri.hasPort ? ':${uri.port}' : '';
      s = '${uri.scheme}://${uri.host}$port';
    }
    while (s.endsWith('/')) {
      s = s.substring(0, s.length - 1);
    }
    return s;
  }

  static String ytThumb(String videoId) =>
      'https://i.ytimg.com/vi/$videoId/hqdefault.jpg';

  static String ytWatch(String videoId, {int? t}) {
    final base = 'https://www.youtube.com/watch?v=$videoId';
    if (t != null && t > 0) return '$base&t=${t}s';
    return base;
  }
}

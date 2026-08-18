import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/config.dart';
import '../models/models.dart';

/// Secure session persistence.
/// JWT + user identity live in platform secure storage (Keychain / Keystore).
/// Non-sensitive prefs (theme, API base URL) stay in SharedPreferences.
class SessionStore {
  static const _kSession = 'vsa_mobile_session_secure_v2';
  static const _kLegacySession = 'vsa_mobile_session_v1';
  static const _kApi = 'vsa_mobile_api_base_v1';
  static const _kTheme = 'vsa_mobile_theme_v1';

  // unlocked: avoid hangs when device is still locking keychain on cold start
  final FlutterSecureStorage _secure = const FlutterSecureStorage(
    aOptions: AndroidOptions(),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.unlocked,
    ),
  );

  Future<Session?> loadSession() async {
    // Prefer secure storage
    try {
      final raw = await _secure.read(key: _kSession);
      if (raw != null && raw.isNotEmpty) {
        final map = jsonDecode(raw) as Map<String, dynamic>;
        final s = Session.fromJson(map);
        if (s.token.isEmpty || s.url.isEmpty || s.user.userId.isEmpty) {
          await clearSession();
          return null;
        }
        return s;
      }
    } catch (_) {
      /* corrupt secure entry */
    }

    // One-time migrate from older SharedPreferences session (insecure)
    try {
      final p = await SharedPreferences.getInstance();
      final legacy = p.getString(_kLegacySession);
      if (legacy != null && legacy.isNotEmpty) {
        final map = jsonDecode(legacy) as Map<String, dynamic>;
        final s = Session.fromJson(map);
        await saveSession(s);
        await p.remove(_kLegacySession);
        return s;
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  Future<void> saveSession(Session s) async {
    // Never persist empty tokens
    if (s.token.isEmpty) {
      await clearSession();
      return;
    }
    await _secure.write(key: _kSession, value: jsonEncode(s.toJson()));
    // Keep API base in prefs for pre-login forms
    await saveApiBase(s.url);
    // Wipe any legacy plaintext copy
    try {
      final p = await SharedPreferences.getInstance();
      await p.remove(_kLegacySession);
    } catch (_) {}
  }

  Future<void> clearSession() async {
    try {
      await _secure.delete(key: _kSession);
    } catch (_) {}
    try {
      final p = await SharedPreferences.getInstance();
      await p.remove(_kLegacySession);
    } catch (_) {}
  }

  Future<String> loadApiBase() async {
    final p = await SharedPreferences.getInstance();
    final saved = AppConfig.normalizeBase(
      p.getString(_kApi) ?? AppConfig.defaultApiBase,
    );
    // A leftover 127.0.0.1 pref from simulator/web must not hide a
    // --dart-define=VAULT_API_BASE=http://LAN:8787 given at build time.
    final defined = AppConfig.dartDefineApiBase.trim();
    if (defined.isNotEmpty && AppConfig.isLoopbackBase(saved)) {
      return AppConfig.normalizeBase(defined);
    }
    return saved;
  }

  Future<void> saveApiBase(String base) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kApi, AppConfig.normalizeBase(base));
  }

  Future<bool> loadDark() async {
    final p = await SharedPreferences.getInstance();
    return p.getBool(_kTheme) ?? true;
  }

  Future<void> saveDark(bool dark) async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_kTheme, dark);
  }
}

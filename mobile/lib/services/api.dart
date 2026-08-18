import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/config.dart';
import '../models/models.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final bool isAuth;
  final bool isNetwork;

  ApiException(
    this.message, {
    this.statusCode,
    this.isAuth = false,
    this.isNetwork = false,
  });

  @override
  String toString() => message;
}

/// Typed vault API client — all account-scoped routes require Bearer JWT.
class VaultApi {
  // Keep timeouts tight on mobile so bad vault URLs don't freeze UI
  static const _timeout = Duration(seconds: 12);
  static const _longTimeout = Duration(seconds: 20);

  Future<Map<String, dynamic>> _json(
    String method,
    String base,
    String path, {
    String? token,
    Object? body,
    bool authRequired = false,
  }) async {
    if (authRequired && (token == null || token.isEmpty)) {
      throw ApiException('Not signed in', isAuth: true, statusCode: 401);
    }

    final cleanBase = AppConfig.normalizeBase(base);
    if (cleanBase.isEmpty) {
      throw ApiException('Vault URL is not configured', isNetwork: true);
    }

    final uri = Uri.parse('$cleanBase$path');
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      // Never log this header value
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };

    late http.Response res;
    try {
      final timeout = method == 'POST' ? _longTimeout : _timeout;
      switch (method) {
        case 'GET':
          res = await http.get(uri, headers: headers).timeout(timeout);
          break;
        case 'DELETE':
          res = await http.delete(uri, headers: headers).timeout(timeout);
          break;
        case 'POST':
          res = await http
              .post(
                uri,
                headers: headers,
                body: body == null ? null : jsonEncode(body),
              )
              .timeout(timeout);
          break;
        default:
          throw ApiException('Unsupported method $method');
      }
    } on TimeoutException {
      throw ApiException(
        _networkHint(
          cleanBase,
          'Vault timed out at $cleanBase. Is the server running?',
        ),
        isNetwork: true,
      );
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(
        _networkHint(
          cleanBase,
          'Cannot reach vault at $cleanBase.',
        ),
        isNetwork: true,
      );
    }

    Map<String, dynamic> data = {};
    if (res.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) {
          data = decoded;
        } else if (decoded is Map) {
          data = Map<String, dynamic>.from(decoded);
        }
      } catch (_) {
        /* non-JSON body */
      }
    }

    if (res.statusCode == 401 || res.statusCode == 403) {
      throw ApiException(
        data['message']?.toString() ?? 'Session expired — sign in again',
        statusCode: res.statusCode,
        isAuth: true,
      );
    }

    if (res.statusCode >= 400 || data['ok'] == false) {
      throw ApiException(
        data['message']?.toString() ?? 'Request failed (${res.statusCode})',
        statusCode: res.statusCode,
      );
    }

    return data;
  }

  String _networkHint(String base, String head) {
    final loop = AppConfig.isLoopbackBase(base);
    final parts = <String>[head];
    if (loop && AppConfig.isPhysicalMobile) {
      parts.add(
        'This phone cannot use 127.0.0.1 / localhost — that is the phone, not your Mac. '
        'Open “Vault server URL” and set http://YOUR_MAC_LAN_IP:8787 '
        '(on Mac: ipconfig getifaddr en0). Same Wi‑Fi required.',
      );
    } else if (loop) {
      parts.add('If this is a physical device, use your Mac LAN IP, not localhost.');
    } else {
      parts.add(
        'Check: Mac vault on 0.0.0.0:8787, phone on same Wi‑Fi, no VPN, '
        'and macOS Firewall allows Node.',
      );
    }
    return parts.join(' ');
  }

  /// GET /health — used by login “Test connection”.
  Future<Map<String, dynamic>> pingHealth(String base) async {
    final cleanBase = AppConfig.normalizeBase(base);
    if (AppConfig.isLoopbackBase(cleanBase) && AppConfig.isPhysicalMobile) {
      throw ApiException(
        _networkHint(cleanBase, 'Loopback URL will not work on a real phone.'),
        isNetwork: true,
      );
    }
    final uri = Uri.parse('$cleanBase/health');
    try {
      final res = await http
          .get(uri, headers: {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 6));
      Map<String, dynamic> data = {};
      if (res.body.isNotEmpty) {
        try {
          final decoded = jsonDecode(res.body);
          if (decoded is Map<String, dynamic>) data = decoded;
        } catch (_) {}
      }
      if (res.statusCode >= 400 || data['ok'] == false) {
        throw ApiException(
          data['message']?.toString() ??
              'Health check failed (${res.statusCode})',
        );
      }
      return data;
    } on TimeoutException {
      throw ApiException(
        _networkHint(cleanBase, 'Health check timed out at $cleanBase.'),
        isNetwork: true,
      );
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(
        _networkHint(cleanBase, 'Cannot reach $cleanBase/health.'),
        isNetwork: true,
      );
    }
  }

  Future<Session> login({
    required String base,
    required String email,
    required String password,
  }) async {
    final clean = AppConfig.normalizeBase(base);
    if (AppConfig.isLoopbackBase(clean) && AppConfig.isPhysicalMobile) {
      throw ApiException(
        _networkHint(clean, 'Cannot sign in with a loopback vault URL.'),
        isNetwork: true,
      );
    }
    final data = await _json(
      'POST',
      clean,
      '/api/auth/login',
      body: {
        'email': email.trim().toLowerCase(),
        'password': password,
      },
    );
    return _sessionFromAuth(clean, data);
  }

  Future<Session> register({
    required String base,
    required String email,
    required String password,
    String? displayName,
  }) async {
    final clean = AppConfig.normalizeBase(base);
    if (AppConfig.isLoopbackBase(clean) && AppConfig.isPhysicalMobile) {
      throw ApiException(
        _networkHint(clean, 'Cannot register with a loopback vault URL.'),
        isNetwork: true,
      );
    }
    final data = await _json(
      'POST',
      clean,
      '/api/auth/register',
      body: {
        'email': email.trim().toLowerCase(),
        'password': password,
        if (displayName != null && displayName.trim().isNotEmpty)
          'displayName': displayName.trim(),
      },
    );
    return _sessionFromAuth(clean, data);
  }

  Session _sessionFromAuth(String base, Map<String, dynamic> data) {
    final token = data['token']?.toString() ?? '';
    if (token.isEmpty) {
      throw ApiException('Auth response missing token', isAuth: true);
    }
    final userMap = data['user'];
    if (userMap is! Map) {
      throw ApiException('Auth response missing user', isAuth: true);
    }
    return Session(
      url: AppConfig.normalizeBase(base),
      token: token,
      user: VaultUser.fromJson(Map<String, dynamic>.from(userMap)),
    );
  }

  /// Validates token still works for this account.
  Future<VaultUser> me(Session s) async {
    final data = await _json(
      'GET',
      s.url,
      '/api/auth/me',
      token: s.token,
      authRequired: true,
    );
    final userMap = data['user'];
    if (userMap is! Map) {
      throw ApiException('Invalid /me response', isAuth: true);
    }
    return VaultUser.fromJson(Map<String, dynamic>.from(userMap));
  }

  Future<List<VaultRow>> fetchVault(Session s) async {
    final data = await _json(
      'GET',
      s.url,
      '/api/vault',
      token: s.token,
      authRequired: true,
    );
    final rows = data['rows'] as List? ?? [];
    final out = <VaultRow>[];
    for (final e in rows) {
      if (e is! Map) continue;
      try {
        final row = VaultRow.fromJson(Map<String, dynamic>.from(e));
        if (row.videoId.isNotEmpty) out.add(row);
      } catch (_) {
        // Skip a corrupt row instead of failing the whole vault load.
      }
    }
    return out;
  }

  Future<VaultRow> fetchVideo(Session s, String videoId) async {
    final data = await _json(
      'GET',
      s.url,
      '/api/vault/${Uri.encodeComponent(videoId)}',
      token: s.token,
      authRequired: true,
    );
    return VaultRow.fromJson(data);
  }

  Future<LibraryState> libraryAction(
    Session s, {
    required String videoId,
    required String action,
    String? playlist,
    String? videoTitle,
  }) async {
    if (videoId.isEmpty) throw ApiException('videoId required');
    final data = await _json(
      'POST',
      s.url,
      '/api/vault/library',
      token: s.token,
      authRequired: true,
      body: {
        'videoId': videoId,
        'videoTitle': videoTitle,
        'videoUrl': 'https://www.youtube.com/watch?v=$videoId',
        'action': action,
        if (playlist != null && playlist.trim().isNotEmpty)
          'playlist': playlist.trim(),
      },
    );
    final lib = data['library'];
    if (lib is Map) {
      return LibraryState.fromJson(Map<String, dynamic>.from(lib));
    }
    // Server should always return library; fallback empty
    return LibraryState();
  }

  Future<void> recordView(Session s, String videoId) async {
    if (videoId.isEmpty) return;
    try {
      await _json(
        'POST',
        s.url,
        '/api/vault/view',
        token: s.token,
        authRequired: true,
        body: {'videoId': videoId},
      );
    } catch (_) {
      // View tracking is best-effort
    }
  }

  Future<void> deleteVideo(Session s, String videoId) async {
    await _json(
      'DELETE',
      s.url,
      '/api/vault/${Uri.encodeComponent(videoId)}',
      token: s.token,
      authRequired: true,
    );
  }

  Future<void> deleteHighlight(
    Session s,
    String videoId,
    String highlightId,
  ) async {
    await _json(
      'DELETE',
      s.url,
      '/api/vault/${Uri.encodeComponent(videoId)}/highlights/${Uri.encodeComponent(highlightId)}',
      token: s.token,
      authRequired: true,
    );
  }

  Future<void> deleteShot(Session s, String videoId, String shotId) async {
    await _json(
      'DELETE',
      s.url,
      '/api/vault/${Uri.encodeComponent(videoId)}/screenshots/${Uri.encodeComponent(shotId)}',
      token: s.token,
      authRequired: true,
    );
  }

  Future<void> saveBio(
    Session s, {
    required String videoId,
    required String bioText,
    String? bioMarkdown,
    String? videoTitle,
  }) async {
    // Empty arrays merge server-side — will not wipe marks/shots
    await _json(
      'POST',
      s.url,
      '/api/vault/sync',
      token: s.token,
      authRequired: true,
      body: {
        'videoId': videoId,
        'videoTitle': videoTitle,
        'videoUrl': 'https://www.youtube.com/watch?v=$videoId',
        'highlights': <dynamic>[],
        'screenshots': <dynamic>[],
        'sourceLinks': <dynamic>[],
        'bioText': bioText,
        'bioMarkdown': bioMarkdown ?? bioText,
      },
    );
  }

  Future<({String shareUrl, String sharePath, String token})> createShare(
    Session s,
    String videoId,
  ) async {
    final data = await _json(
      'POST',
      s.url,
      '/api/vault/${Uri.encodeComponent(videoId)}/share',
      token: s.token,
      authRequired: true,
      body: <String, dynamic>{},
    );
    var shareUrl = data['shareUrl']?.toString() ?? '';
    final sharePath = data['sharePath']?.toString() ?? '';
    // Prefer same-host studio path when available
    if (sharePath.isNotEmpty) {
      shareUrl = '${s.url}$sharePath';
    }
    return (
      shareUrl: shareUrl,
      sharePath: sharePath,
      token: data['token']?.toString() ?? '',
    );
  }

  Future<Map<String, dynamic>> aiSearch(Session s, String query) async {
    final q = query.trim();
    if (q.isEmpty) throw ApiException('Query required');
    if (q.length > 2000) throw ApiException('Query too long');
    return _json(
      'POST',
      s.url,
      '/api/vault/ai-search',
      token: s.token,
      authRequired: true,
      body: {'query': q},
    );
  }

  Future<bool> health(String base) async {
    try {
      final uri = Uri.parse('${AppConfig.normalizeBase(base)}/health');
      final res = await http.get(uri).timeout(const Duration(seconds: 6));
      if (res.statusCode != 200) return false;
      try {
        final data = jsonDecode(res.body);
        return data is Map && data['ok'] == true;
      } catch (_) {
        return true; // 200 is enough
      }
    } catch (_) {
      return false;
    }
  }

  /// Stable per-shot proxy against the *current* session host.
  /// Never trust imageUrl hosts baked as localhost from an older client.
  String shotProxyUrl({
    required String videoId,
    required String shotId,
    required String? token,
    required String apiBase,
  }) {
    if (videoId.isEmpty || shotId.isEmpty) return '';
    final path =
        '/api/vault/shot/${Uri.encodeComponent(videoId)}/${Uri.encodeComponent(shotId)}';
    return mediaUrl(path, token, apiBase: apiBase);
  }

  /// Shot/media URLs need JWT as query (img widgets cannot send Authorization).
  /// Also rewrites localhost / 127.0.0.1 absolute URLs → current apiBase
  /// so a real iPhone can load shots from the Mac LAN vault.
  String mediaUrl(String? url, String? token, {String? apiBase}) {
    if (url == null || url.isEmpty) return '';
    if (url.startsWith('data:')) return url;
    if (url.startsWith('account:') ||
        url.startsWith('blob:') ||
        url.startsWith('chrome-extension:')) {
      return '';
    }

    final base = (apiBase != null && apiBase.isNotEmpty)
        ? AppConfig.normalizeBase(apiBase)
        : '';
    var resolved = url.trim();

    if (resolved.startsWith('/') && base.isNotEmpty) {
      resolved = '$base$resolved';
    } else if (base.isNotEmpty) {
      final uri = Uri.tryParse(resolved);
      if (uri != null && uri.hasScheme && uri.host.isNotEmpty) {
        final host = uri.host.toLowerCase();
        final loop = host == 'localhost' ||
            host == '127.0.0.1' ||
            host == '::1' ||
            host == '0.0.0.0' ||
            host == '10.0.2.2';
        // Phone cannot load images saved against the Mac's localhost.
        if (loop) {
          final b = Uri.parse(base);
          resolved = uri
              .replace(
                scheme: b.scheme,
                host: b.host,
                port: b.hasPort ? b.port : null,
              )
              .toString();
        }
      }
    }

    if (token == null || token.isEmpty) return resolved;
    if (resolved.contains('token=')) return resolved;
    if (resolved.contains('/api/media/') ||
        resolved.contains('/api/vault/shot/')) {
      final sep = resolved.contains('?') ? '&' : '?';
      return '$resolved${sep}token=${Uri.encodeComponent(token)}';
    }
    return resolved;
  }
}

class LibraryState {
  final bool saved;
  final int? savedAt;
  final bool watchLater;
  final int? watchLaterAt;
  final List<String> playlists;

  LibraryState({
    this.saved = false,
    this.savedAt,
    this.watchLater = false,
    this.watchLaterAt,
    this.playlists = const [],
  });

  factory LibraryState.fromJson(Map<String, dynamic> j) => LibraryState(
        saved: j['saved'] == true,
        savedAt: (j['savedAt'] as num?)?.toInt(),
        watchLater: j['watchLater'] == true,
        watchLaterAt: (j['watchLaterAt'] as num?)?.toInt(),
        playlists: (j['playlists'] as List? ?? [])
            .map((e) => e.toString())
            .toList(),
      );
}

import 'package:flutter/foundation.dart';
import '../core/format.dart';
import '../core/sort.dart';
import '../models/models.dart';
import '../services/api.dart';
import '../services/session_store.dart';

/// Global app state: session (secure), vault rows synced to the signed-in account.
class AppState extends ChangeNotifier {
  final api = VaultApi();
  final store = SessionStore();

  Session? session;
  String apiBase = '';
  bool dark = true;
  bool bootstrapped = false;
  bool loading = false;
  bool actionBusy = false;
  String? error;
  List<VaultRow> rows = [];

  Future<void>? _vaultInFlight;

  // ── bootstrap ──────────────────────────────────────────

  bool _bootstrapStarted = false;

  /// Absolute failsafe if bootstrap Future never settles (keychain hang, etc.).
  void forceBootstrapped() {
    if (bootstrapped) return;
    bootstrapped = true;
    if (apiBase.isEmpty) apiBase = 'http://127.0.0.1:8787';
    notifyListeners();
  }

  Future<void> bootstrap() async {
    if (_bootstrapStarted) return;
    _bootstrapStarted = true;

    try {
      await _bootstrapBody().timeout(
        const Duration(seconds: 6),
        onTimeout: () {
          debugPrint('bootstrap: overall timeout');
        },
      );
    } catch (e) {
      // Absolute last resort — still show login UI
      debugPrint('bootstrap error: $e');
    } finally {
      bootstrapped = true;
      notifyListeners();
    }

    // Load vault after UI is up (never block first paint)
    if (session != null) {
      // ignore: unawaited_futures
      refreshVault(force: true);
    }
  }

  Future<void> _bootstrapBody() async {
    // Time-box every step so a real iPhone never sticks on splash
    dark = await store.loadDark().timeout(
          const Duration(seconds: 2),
          onTimeout: () => true,
        );
    apiBase = await store.loadApiBase().timeout(
          const Duration(seconds: 2),
          onTimeout: () =>
              apiBase.isEmpty ? 'http://127.0.0.1:8787' : apiBase,
        );

    Session? saved;
    try {
      saved = await store.loadSession().timeout(
            const Duration(seconds: 2),
            onTimeout: () => null,
          );
    } catch (_) {
      saved = null;
    }

    if (saved == null) return;

    // Short validation only — do not block UI on a dead vault URL
    try {
      final user = await api.me(saved).timeout(
            const Duration(seconds: 3),
          );
      session = Session(url: saved.url, token: saved.token, user: user);
      apiBase = session!.url;
      // ignore: unawaited_futures
      store.saveSession(session!);
    } on ApiException catch (e) {
      if (e.isAuth) {
        await store.clearSession();
        session = null;
      } else {
        // Offline / wrong LAN URL — keep session so user can fix API in More
        session = saved;
        apiBase = saved.url.isNotEmpty ? saved.url : apiBase;
      }
    } catch (_) {
      session = saved;
      if (saved.url.isNotEmpty) apiBase = saved.url;
    }
  }

  // ── prefs ──────────────────────────────────────────────

  Future<void> setDark(bool v) async {
    dark = v;
    await store.saveDark(v);
    notifyListeners();
  }

  Future<void> setApiBase(String base) async {
    await store.saveApiBase(base);
    apiBase = await store.loadApiBase();
    // Keep session URL in sync if signed in
    if (session != null) {
      session = Session(
        url: apiBase,
        token: session!.token,
        user: session!.user,
      );
      await store.saveSession(session!);
    }
    notifyListeners();
  }

  // ── auth (account-bound) ───────────────────────────────

  Future<void> login(String email, String password) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      session = await api.login(
        base: apiBase,
        email: email,
        password: password,
      );
      await store.saveSession(session!);
      apiBase = session!.url;
      await refreshVault(force: true);
    } catch (e) {
      error = e.toString();
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> register(String email, String password, String name) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      session = await api.register(
        base: apiBase,
        email: email,
        password: password,
        displayName: name,
      );
      await store.saveSession(session!);
      apiBase = session!.url;
      await refreshVault(force: true);
    } catch (e) {
      error = e.toString();
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    session = null;
    rows = [];
    error = null;
    await store.clearSession();
    notifyListeners();
  }

  Future<void> _handleAuthFailure(Object e) async {
    if (e is ApiException && e.isAuth) {
      await logout();
    }
  }

  // ── vault sync (always for current session.userId on server) ──

  Future<void> refreshVault({bool force = false}) async {
    final s = session;
    if (s == null) return;

    if (_vaultInFlight != null) {
      await _vaultInFlight;
      if (!force) return;
    }

    final run = () async {
      loading = true;
      error = null;
      notifyListeners();
      try {
        rows = await api.fetchVault(s);
        error = null;
      } catch (e) {
        error = e.toString();
        await _handleAuthFailure(e);
      } finally {
        loading = false;
        notifyListeners();
      }
    }();

    _vaultInFlight = run;
    try {
      await run;
    } finally {
      _vaultInFlight = null;
    }
  }

  // ── derived selectors ──────────────────────────────────

  VaultStats get stats {
    var marks = 0, shots = 0, notes = 0, wl = 0, savedN = 0;
    for (final r in rows) {
      final p = r.payload;
      marks += p.markCount;
      shots += p.shotCount;
      notes += p.noteCount;
      if (p.watchLater) wl++;
      if (p.saved) savedN++;
    }
    return VaultStats(
      videos: rows.length,
      marks: marks,
      shots: shots,
      notes: notes,
      watchLater: wl,
      saved: savedN,
    );
  }

  List<VaultRow> get recent {
    final list = [...rows]..sort((a, b) => b.activityMs.compareTo(a.activityMs));
    return list.take(12).toList();
  }

  List<VaultRow> get history {
    final list = [...rows]..sort((a, b) => b.activityMs.compareTo(a.activityMs));
    return list;
  }

  List<VaultRow> get watchLaterRows =>
      rows.where((r) => r.payload.watchLater).toList()
        ..sort((a, b) => (b.payload.watchLaterAt ?? 0)
            .compareTo(a.payload.watchLaterAt ?? 0));

  List<VaultRow> get savedRows =>
      rows.where((r) => r.payload.saved).toList()
        ..sort((a, b) =>
            (b.payload.savedAt ?? 0).compareTo(a.payload.savedAt ?? 0));

  List<PlaylistGroup> get playlists {
    final map = <String, List<VaultRow>>{};
    final titles = <String, String>{};
    for (final r in rows) {
      for (final name in r.payload.playlists) {
        if (name.trim().isEmpty) continue;
        var key = name.toLowerCase();
        // Merge 80-char truncated names with the full title
        for (final existing in map.keys.toList()) {
          if (existing == key) continue;
          if (existing.length >= 40 &&
              key.length >= 40 &&
              (existing.startsWith(key) || key.startsWith(existing))) {
            if (existing.length >= key.length) {
              key = existing;
            } else {
              map[key] = map.remove(existing) ?? [];
              titles[key] = titles.remove(existing) ?? name;
            }
            break;
          }
        }
        map.putIfAbsent(key, () => []);
        if (!map[key]!.any((x) => x.videoId == r.videoId)) {
          map[key]!.add(r);
        }
        final cur = titles[key] ?? name;
        if (name.length >= cur.length) titles[key] = name;
      }
    }
    return map.entries
        .map((e) {
          return PlaylistGroup(
            name: titles[e.key] ?? e.key,
            rows: sortByActivityNewest(e.value),
          );
        })
        .toList()
      ..sort((a, b) {
        final ta = a.rows.isEmpty ? 0 : a.rows.first.activityMs;
        final tb = b.rows.isEmpty ? 0 : b.rows.first.activityMs;
        if (tb != ta) return tb.compareTo(ta);
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });
  }

  List<String> get playlistNames => playlists.map((g) => g.name).toList();

  VaultRow? video(String id) {
    for (final r in rows) {
      if (r.videoId == id) return r;
    }
    return null;
  }

  /// Refresh one video from the server so bio / sources / shots match Studio.
  Future<void> ensureVideo(String videoId) async {
    final s = session;
    if (s == null || videoId.isEmpty) return;
    try {
      final row = await api.fetchVideo(s, videoId);
      final i = rows.indexWhere((r) => r.videoId == videoId);
      if (i >= 0) {
        final next = [...rows];
        next[i] = row;
        rows = next;
      } else {
        rows = [row, ...rows];
      }
      notifyListeners();
    } catch (e) {
      await _handleAuthFailure(e);
    }
  }

  List<SearchHit> search(String q) {
    final query = q.trim().toLowerCase();
    if (query.isEmpty) return [];
    final hits = <SearchHit>[];
    for (final r in rows) {
      final p = r.payload;
      final title = p.displayTitle;
      if (title.toLowerCase().contains(query) ||
          p.channelTitle.toLowerCase().contains(query)) {
        hits.add(SearchHit(
          kind: 'video',
          videoId: r.videoId,
          title: title,
          snippet: p.channelTitle.isNotEmpty ? p.channelTitle : title,
          score: 3,
        ));
      }
      for (final h in p.highlights) {
        if (h.note.toLowerCase().contains(query)) {
          hits.add(SearchHit(
            kind: 'mark',
            videoId: r.videoId,
            title: title,
            snippet: h.note,
            time: h.startTime,
            score: 2,
          ));
        }
      }
      for (final s in p.screenshots) {
        if (s.note.toLowerCase().contains(query)) {
          hits.add(SearchHit(
            kind: 'shot',
            videoId: r.videoId,
            title: title,
            snippet: s.note.isEmpty ? 'Shot' : s.note,
            time: s.videoTime,
            score: 2,
          ));
        }
      }
      final bio = '${p.bioText} ${p.bioMarkdown}'.toLowerCase();
      if (bio.contains(query)) {
        hits.add(SearchHit(
          kind: 'video',
          videoId: r.videoId,
          title: title,
          snippet: 'Bio match',
          score: 1.5,
        ));
      }
      for (final l in p.sourceLinks) {
        if (l.label.toLowerCase().contains(query) ||
            l.url.toLowerCase().contains(query)) {
          hits.add(SearchHit(
            kind: 'video',
            videoId: r.videoId,
            title: title,
            snippet: l.label.isEmpty ? l.url : l.label,
            score: 1.8,
          ));
        }
      }
    }
    hits.sort((a, b) => b.score.compareTo(a.score));
    return hits.take(80).toList();
  }

  // ── mutations (server is source of truth for userId) ───

  void _applyLibrary(String videoId, LibraryState lib) {
    rows = rows.map((r) {
      if (r.videoId != videoId) return r;
      final p = r.payload;
      return VaultRow(
        videoId: r.videoId,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
        payload: VaultPayload(
          videoId: p.videoId,
          videoTitle: p.videoTitle,
          videoUrl: p.videoUrl,
          channelTitle: p.channelTitle,
          channelUrl: p.channelUrl,
          highlights: p.highlights,
          screenshots: p.screenshots,
          sourceLinks: p.sourceLinks,
          bioText: p.bioText,
          bioMarkdown: p.bioMarkdown,
          bioSyncedAt: p.bioSyncedAt,
          saved: lib.saved,
          savedAt: lib.savedAt,
          watchLater: lib.watchLater,
          watchLaterAt: lib.watchLaterAt,
          playlists: lib.playlists,
          updatedAt: p.updatedAt,
          lastViewedAt: p.lastViewedAt,
          createdAt: p.createdAt,
        ),
      );
    }).toList();
    notifyListeners();
  }

  DateTime? _lastViewStamp;
  String? _lastViewId;

  /// Stamp lastViewedAt when the user actually plays the video.
  Future<void> recordView(String videoId) async {
    final s = session;
    if (s == null || videoId.isEmpty) return;
    final now = DateTime.now();
    if (_lastViewId == videoId &&
        _lastViewStamp != null &&
        now.difference(_lastViewStamp!).inMinutes < 2) {
      return;
    }
    _lastViewId = videoId;
    _lastViewStamp = now;
    final ms = now.millisecondsSinceEpoch;
    rows = rows.map((r) {
      if (r.videoId != videoId) return r;
      final p = r.payload;
      return VaultRow(
        videoId: r.videoId,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
        payload: VaultPayload(
          videoId: p.videoId,
          videoTitle: p.videoTitle,
          videoUrl: p.videoUrl,
          channelTitle: p.channelTitle,
          channelUrl: p.channelUrl,
          highlights: p.highlights,
          screenshots: p.screenshots,
          sourceLinks: p.sourceLinks,
          bioText: p.bioText,
          bioMarkdown: p.bioMarkdown,
          bioSyncedAt: p.bioSyncedAt,
          saved: p.saved,
          savedAt: p.savedAt,
          watchLater: p.watchLater,
          watchLaterAt: p.watchLaterAt,
          playlists: p.playlists,
          updatedAt: p.updatedAt,
          lastViewedAt: ms,
          createdAt: p.createdAt,
        ),
      );
    }).toList();
    notifyListeners();
    await api.recordView(s, videoId);
  }

  Future<void> toggleWatchLater(String videoId) async {
    final s = session;
    if (s == null) return;
    actionBusy = true;
    notifyListeners();
    try {
      final lib = await api.libraryAction(
        s,
        videoId: videoId,
        action: 'toggle_watch_later',
        videoTitle: video(videoId)?.payload.videoTitle,
      );
      _applyLibrary(videoId, lib);
    } catch (e) {
      await _handleAuthFailure(e);
      rethrow;
    } finally {
      actionBusy = false;
      notifyListeners();
    }
  }

  Future<void> addToPlaylist(String videoId, String playlist) async {
    await _playlistAction(videoId, 'add_playlist', playlist);
  }

  Future<void> removeFromPlaylist(String videoId, String playlist) async {
    await _playlistAction(videoId, 'remove_playlist', playlist);
  }

  Future<void> togglePlaylist(String videoId, String playlist) async {
    await _playlistAction(videoId, 'toggle_playlist', playlist);
  }

  Future<void> _playlistAction(
    String videoId,
    String action,
    String playlist,
  ) async {
    final s = session;
    if (s == null) return;
    final name = playlist.trim();
    if (name.isEmpty) throw ApiException('Playlist name required');
    actionBusy = true;
    notifyListeners();
    try {
      final lib = await api.libraryAction(
        s,
        videoId: videoId,
        action: action,
        playlist: name,
        videoTitle: video(videoId)?.payload.videoTitle,
      );
      _applyLibrary(videoId, lib);
    } catch (e) {
      await _handleAuthFailure(e);
      rethrow;
    } finally {
      actionBusy = false;
      notifyListeners();
    }
  }

  Future<void> toggleSave(String videoId) async {
    final s = session;
    if (s == null) return;
    actionBusy = true;
    notifyListeners();
    try {
      final lib = await api.libraryAction(
        s,
        videoId: videoId,
        action: 'toggle_save',
        videoTitle: video(videoId)?.payload.videoTitle,
      );
      _applyLibrary(videoId, lib);
    } catch (e) {
      await _handleAuthFailure(e);
      rethrow;
    } finally {
      actionBusy = false;
      notifyListeners();
    }
  }

  Future<void> deleteVideo(String videoId) async {
    final s = session;
    if (s == null) return;
    try {
      await api.deleteVideo(s, videoId);
      rows = rows.where((r) => r.videoId != videoId).toList();
      notifyListeners();
    } catch (e) {
      await _handleAuthFailure(e);
      rethrow;
    }
  }

  Future<void> deleteMark(String videoId, String highlightId) async {
    final s = session;
    if (s == null) return;
    try {
      await api.deleteHighlight(s, videoId, highlightId);
      rows = rows.map((r) {
        if (r.videoId != videoId) return r;
        final p = r.payload;
        return VaultRow(
          videoId: r.videoId,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
          payload: VaultPayload(
            videoId: p.videoId,
            videoTitle: p.videoTitle,
            videoUrl: p.videoUrl,
            channelTitle: p.channelTitle,
            channelUrl: p.channelUrl,
            highlights:
                p.highlights.where((h) => h.id != highlightId).toList(),
            screenshots: p.screenshots,
            sourceLinks: p.sourceLinks,
            bioText: p.bioText,
            bioMarkdown: p.bioMarkdown,
            bioSyncedAt: p.bioSyncedAt,
            saved: p.saved,
            savedAt: p.savedAt,
            watchLater: p.watchLater,
            watchLaterAt: p.watchLaterAt,
            playlists: p.playlists,
            updatedAt: p.updatedAt,
            lastViewedAt: p.lastViewedAt,
            createdAt: p.createdAt,
          ),
        );
      }).toList();
      notifyListeners();
    } catch (e) {
      await _handleAuthFailure(e);
      rethrow;
    }
  }

  Future<void> deleteShot(String videoId, String shotId) async {
    final s = session;
    if (s == null) return;
    try {
      await api.deleteShot(s, videoId, shotId);
      rows = rows.map((r) {
        if (r.videoId != videoId) return r;
        final p = r.payload;
        return VaultRow(
          videoId: r.videoId,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
          payload: VaultPayload(
            videoId: p.videoId,
            videoTitle: p.videoTitle,
            videoUrl: p.videoUrl,
            channelTitle: p.channelTitle,
            channelUrl: p.channelUrl,
            highlights: p.highlights,
            screenshots: p.screenshots.where((x) => x.id != shotId).toList(),
            sourceLinks: p.sourceLinks,
            bioText: p.bioText,
            bioMarkdown: p.bioMarkdown,
            bioSyncedAt: p.bioSyncedAt,
            saved: p.saved,
            savedAt: p.savedAt,
            watchLater: p.watchLater,
            watchLaterAt: p.watchLaterAt,
            playlists: p.playlists,
            updatedAt: p.updatedAt,
            lastViewedAt: p.lastViewedAt,
            createdAt: p.createdAt,
          ),
        );
      }).toList();
      notifyListeners();
    } catch (e) {
      await _handleAuthFailure(e);
      rethrow;
    }
  }

  Future<void> saveBio(String videoId, String text) async {
    final s = session;
    if (s == null) return;
    final row = video(videoId);
    try {
      await api.saveBio(
        s,
        videoId: videoId,
        bioText: text,
        bioMarkdown: text,
        videoTitle: row?.payload.videoTitle,
      );
      await refreshVault(force: true);
    } catch (e) {
      await _handleAuthFailure(e);
      rethrow;
    }
  }

  Future<String> shareVideo(String videoId) async {
    final s = session;
    if (s == null) throw ApiException('Not signed in', isAuth: true);
    try {
      final r = await api.createShare(s, videoId);
      if (r.shareUrl.isNotEmpty) return r.shareUrl;
      return '${s.url}${r.sharePath}';
    } catch (e) {
      await _handleAuthFailure(e);
      rethrow;
    }
  }

  List<SourceLink> usefulSources(VaultPayload p) => p.sourceLinks
      .where((l) => l.url.isNotEmpty && isUsefulSource(l.url, l.kind))
      .toList();

  /// All marks across the vault (newest first) — main product surface.
  List<NoteItem> get allMarks {
    final out = <NoteItem>[];
    final seen = <String>{};
    for (final r in rows) {
      final p = r.payload;
      for (final h in p.highlights) {
        final id = h.id.isNotEmpty ? h.id : 't${h.startTime}';
        final key = '${r.videoId}:$id';
        if (seen.contains(key)) continue;
        seen.add(key);
        out.add(NoteItem(
          highlight: h,
          videoId: r.videoId,
          title: p.displayTitle,
          videoUrl: p.videoUrl.isNotEmpty
              ? p.videoUrl
              : 'https://www.youtube.com/watch?v=${r.videoId}',
          channelTitle: p.channelTitle,
        ));
      }
    }
    out.sort((a, b) =>
        (b.highlight.createdAt ?? 0).compareTo(a.highlight.createdAt ?? 0));
    return out;
  }

  /// All screenshots across the vault (newest first) — main product surface.
  List<ShotItem> get allShots {
    final out = <ShotItem>[];
    final seen = <String>{};
    for (final r in rows) {
      final p = r.payload;
      for (final s in p.screenshots) {
        final id = s.id.isNotEmpty ? s.id : 't${s.videoTime}';
        final key = '${r.videoId}:$id';
        if (seen.contains(key)) continue;
        seen.add(key);
        out.add(ShotItem(
          shot: s,
          videoId: r.videoId,
          title: p.displayTitle,
          videoUrl: p.videoUrl.isNotEmpty
              ? p.videoUrl
              : 'https://www.youtube.com/watch?v=${r.videoId}',
          channelTitle: p.channelTitle,
        ));
      }
    }
    out.sort(
        (a, b) => (b.shot.createdAt ?? 0).compareTo(a.shot.createdAt ?? 0));
    return out;
  }

  /// Always resolve against the live session base (LAN IP on phone).
  /// Prefer the auth shot proxy so images work even when R2 is down
  /// or imageUrl was saved as http://localhost:8787/...
  String shotImageUrl(ShotItem item) {
    final s = session;
    final base = s?.url.isNotEmpty == true ? s!.url : apiBase;
    final token = s?.token;

    // data: URLs (rare in list payloads) — pass through for local decode
    final raw = item.shot.dataUrl;
    if (raw != null && raw.startsWith('data:image')) return raw;

    // Stable proxy first
    final proxy = api.shotProxyUrl(
      videoId: item.videoId,
      shotId: item.shot.id,
      token: token,
      apiBase: base,
    );
    if (proxy.isNotEmpty) return proxy;

    return api.mediaUrl(
      item.shot.imageUrl,
      token,
      apiBase: base,
    );
  }
}

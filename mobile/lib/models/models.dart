Map<String, dynamic> _asMap(dynamic v) {
  if (v is Map<String, dynamic>) return v;
  if (v is Map) return Map<String, dynamic>.from(v);
  return <String, dynamic>{};
}

List<Map<String, dynamic>> _asMapList(dynamic v) {
  if (v is! List) return const <Map<String, dynamic>>[];
  return v
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .toList();
}

class VaultUser {
  final String userId;
  final String email;
  final String? displayName;
  final int? videoCount;
  final int? highlightCount;
  final int? screenshotCount;

  VaultUser({
    required this.userId,
    required this.email,
    this.displayName,
    this.videoCount,
    this.highlightCount,
    this.screenshotCount,
  });

  factory VaultUser.fromJson(Map<String, dynamic> j) => VaultUser(
        userId: j['userId']?.toString() ?? '',
        email: j['email']?.toString() ?? '',
        displayName: j['displayName']?.toString(),
        videoCount: (j['videoCount'] as num?)?.toInt(),
        highlightCount: (j['highlightCount'] as num?)?.toInt(),
        screenshotCount: (j['screenshotCount'] as num?)?.toInt(),
      );

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'email': email,
        'displayName': displayName,
        'videoCount': videoCount,
        'highlightCount': highlightCount,
        'screenshotCount': screenshotCount,
      };

  String get label =>
      (displayName != null && displayName!.trim().isNotEmpty)
          ? displayName!.trim()
          : email;
}

class Session {
  final String url;
  final String token;
  final VaultUser user;

  Session({required this.url, required this.token, required this.user});

  Map<String, dynamic> toJson() => {
        'url': url,
        'token': token,
        'user': user.toJson(),
      };

  factory Session.fromJson(Map<String, dynamic> j) => Session(
        url: j['url']?.toString() ?? '',
        token: j['token']?.toString() ?? '',
        user: VaultUser.fromJson(_asMap(j['user'])),
      );
}

class Highlight {
  final String id;
  final double startTime;
  final double? endTime;
  final String note;
  final String? color;
  final int? createdAt;

  Highlight({
    required this.id,
    required this.startTime,
    this.endTime,
    this.note = '',
    this.color,
    this.createdAt,
  });

  factory Highlight.fromJson(Map<String, dynamic> j) => Highlight(
        id: j['id']?.toString() ?? '',
        startTime: (j['startTime'] as num?)?.toDouble() ?? 0,
        endTime: (j['endTime'] as num?)?.toDouble(),
        note: j['note']?.toString() ?? '',
        color: j['color']?.toString(),
        createdAt: (j['createdAt'] as num?)?.toInt(),
      );
}

class Screenshot {
  final String id;
  final double videoTime;
  final String note;
  final String? imageUrl;
  final String? dataUrl;
  final int? createdAt;

  Screenshot({
    required this.id,
    required this.videoTime,
    this.note = '',
    this.imageUrl,
    this.dataUrl,
    this.createdAt,
  });

  factory Screenshot.fromJson(Map<String, dynamic> j) => Screenshot(
        id: j['id']?.toString() ?? '',
        videoTime: (j['videoTime'] as num?)?.toDouble() ?? 0,
        note: j['note']?.toString() ?? '',
        imageUrl: j['imageUrl']?.toString(),
        dataUrl: j['dataUrl']?.toString(),
        createdAt: (j['createdAt'] as num?)?.toInt(),
      );
}

class SourceLink {
  final String id;
  final String url;
  final String label;
  final String kind;

  SourceLink({
    required this.id,
    required this.url,
    this.label = '',
    this.kind = 'link',
  });

  factory SourceLink.fromJson(Map<String, dynamic> j) => SourceLink(
        id: j['id']?.toString() ?? '',
        url: j['url']?.toString() ?? '',
        label: j['label']?.toString() ?? '',
        kind: j['kind']?.toString() ?? 'link',
      );
}

class VaultPayload {
  final String videoId;
  final String videoTitle;
  final String videoUrl;
  final String channelTitle;
  final String channelUrl;
  final List<Highlight> highlights;
  final List<Screenshot> screenshots;
  final List<SourceLink> sourceLinks;
  final String bioText;
  final String bioMarkdown;
  final int? bioSyncedAt;
  final bool saved;
  final int? savedAt;
  final bool watchLater;
  final int? watchLaterAt;
  final List<String> playlists;
  final int? updatedAt;
  final int? lastViewedAt;
  final int? createdAt;

  VaultPayload({
    required this.videoId,
    this.videoTitle = '',
    this.videoUrl = '',
    this.channelTitle = '',
    this.channelUrl = '',
    this.highlights = const [],
    this.screenshots = const [],
    this.sourceLinks = const [],
    this.bioText = '',
    this.bioMarkdown = '',
    this.bioSyncedAt,
    this.saved = false,
    this.savedAt,
    this.watchLater = false,
    this.watchLaterAt,
    this.playlists = const [],
    this.updatedAt,
    this.lastViewedAt,
    this.createdAt,
  });

  factory VaultPayload.fromJson(Map<String, dynamic> j) => VaultPayload(
        videoId: j['videoId']?.toString() ?? '',
        videoTitle: j['videoTitle']?.toString() ?? '',
        videoUrl: j['videoUrl']?.toString() ?? '',
        channelTitle: j['channelTitle']?.toString() ?? '',
        channelUrl: j['channelUrl']?.toString() ?? '',
        highlights: _asMapList(j['highlights'])
            .map(Highlight.fromJson)
            .where((h) => h.id.isNotEmpty || h.startTime > 0)
            .toList(),
        screenshots: _asMapList(j['screenshots'])
            .map(Screenshot.fromJson)
            .where((s) => s.id.isNotEmpty)
            .toList(),
        sourceLinks: _asMapList(j['sourceLinks'])
            .map(SourceLink.fromJson)
            .where((l) => l.url.isNotEmpty)
            .toList(),
        bioText: j['bioText']?.toString() ?? '',
        bioMarkdown: j['bioMarkdown']?.toString() ?? '',
        bioSyncedAt: (j['bioSyncedAt'] as num?)?.toInt(),
        saved: j['saved'] == true,
        savedAt: (j['savedAt'] as num?)?.toInt(),
        watchLater: j['watchLater'] == true,
        watchLaterAt: (j['watchLaterAt'] as num?)?.toInt(),
        playlists: (j['playlists'] as List? ?? [])
            .map((e) => e.toString())
            .toList(),
        updatedAt: (j['updatedAt'] as num?)?.toInt(),
        lastViewedAt: (j['lastViewedAt'] as num?)?.toInt(),
        createdAt: (j['createdAt'] as num?)?.toInt(),
      );

  String get displayTitle {
    final t = videoTitle.trim();
    if (t.isEmpty || t == videoId) return videoId;
    return t;
  }

  int get markCount => highlights.length;
  int get shotCount => screenshots.length;
  int get noteCount =>
      highlights.where((h) => h.note.trim().isNotEmpty).length +
      screenshots.where((s) => s.note.trim().isNotEmpty).length;
  bool get hasBio =>
      bioText.trim().isNotEmpty || bioMarkdown.trim().isNotEmpty;
}

class VaultRow {
  final String videoId;
  final String updatedAt;
  final String? createdAt;
  final VaultPayload payload;

  VaultRow({
    required this.videoId,
    required this.updatedAt,
    this.createdAt,
    required this.payload,
  });

  factory VaultRow.fromJson(Map<String, dynamic> j) {
    final raw = Map<String, dynamic>.from(_asMap(j['payload']));
    if (raw['videoId'] == null || raw['videoId'].toString().isEmpty) {
      raw['videoId'] =
          j['video_id']?.toString() ?? j['videoId']?.toString() ?? '';
    }
    return VaultRow(
      videoId: j['video_id']?.toString() ??
          j['videoId']?.toString() ??
          raw['videoId']?.toString() ??
          '',
      updatedAt:
          j['updated_at']?.toString() ?? j['updatedAt']?.toString() ?? '',
      createdAt: j['created_at']?.toString() ?? j['createdAt']?.toString(),
      payload: VaultPayload.fromJson(raw),
    );
  }

  /// User-facing activity. Vault sync `updatedAt` is ignored so bio/playlist
  /// imports do not make unwatched videos look “seen now”.
  int get activityMs {
    final candidates = <int>[];
    void add(int? n) {
      if (n != null && n > 0) candidates.add(n);
    }

    add(payload.lastViewedAt);
    add(payload.savedAt);
    add(payload.watchLaterAt);
    for (final h in payload.highlights) {
      add(h.createdAt);
    }
    for (final s in payload.screenshots) {
      add(s.createdAt);
    }
    add(payload.createdAt);
    final added = DateTime.tryParse(createdAt ?? '')?.millisecondsSinceEpoch;
    add(added);
    if (candidates.isEmpty) return 0;
    return candidates.reduce((a, b) => a > b ? a : b);
  }
}

class VaultStats {
  final int videos;
  final int marks;
  final int shots;
  final int notes;
  final int watchLater;
  final int saved;

  VaultStats({
    this.videos = 0,
    this.marks = 0,
    this.shots = 0,
    this.notes = 0,
    this.watchLater = 0,
    this.saved = 0,
  });
}

class PlaylistGroup {
  final String name;
  final List<VaultRow> rows;
  PlaylistGroup({required this.name, required this.rows});
}

class SearchHit {
  final String kind; // video | mark | shot
  final String videoId;
  final String title;
  final String snippet;
  final double? time;
  final double score;

  SearchHit({
    required this.kind,
    required this.videoId,
    required this.title,
    required this.snippet,
    this.time,
    this.score = 0,
  });
}

/// Flattened mark for the global Marks gallery.
class NoteItem {
  final Highlight highlight;
  final String videoId;
  final String title;
  final String videoUrl;
  final String channelTitle;

  NoteItem({
    required this.highlight,
    required this.videoId,
    required this.title,
    required this.videoUrl,
    this.channelTitle = '',
  });
}

/// Flattened shot for the global Shots gallery.
class ShotItem {
  final Screenshot shot;
  final String videoId;
  final String title;
  final String videoUrl;
  final String channelTitle;

  ShotItem({
    required this.shot,
    required this.videoId,
    required this.title,
    required this.videoUrl,
    this.channelTitle = '',
  });
}

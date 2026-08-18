import 'package:intl/intl.dart';
import '../models/models.dart';

/// Lecture / episode number from a title, if it looks like a series entry.
int? episodeIndex(String title) {
  final t = title.trim();
  if (t.isEmpty) return null;

  final patterns = <RegExp>[
    // Lecture 12, Lec. 3, Lecture No.2, Episode 4, Part 1, Chapter 5, Day 3
    RegExp(
      r'\b(?:lecture|lec|lesson|class|episode|ep|part|pt|chapter|ch|session|sesh|week|day|module|mod|unit|vol(?:ume)?)\.?\s*(?:no\.?|number|#)?\s*(\d{1,4})\b',
      caseSensitive: false,
    ),
    // #12 or No. 12
    RegExp(r'(?:^|\s)(?:#|no\.?|nr\.?)\s*(\d{1,4})\b', caseSensitive: false),
    // 3/10 or 3 of 10
    RegExp(r'(?:^|\s)(\d{1,3})\s*(?:of|/)\s*\d{1,3}\b', caseSensitive: false),
    // Leading "01 - Title" or "1. Title"
    RegExp(r'^\s*(\d{1,3})\s*[-–—:.)]\s+\S'),
  ];

  for (final re in patterns) {
    final m = re.firstMatch(t);
    if (m == null) continue;
    final n = int.tryParse(m.group(1) ?? '');
    if (n != null && n > 0 && n < 5000) return n;
  }
  return null;
}

/// Earliest known timestamp for a vault row (when it first showed up).
int firstSeenMs(VaultRow r) {
  final candidates = <int>[];
  final u = DateTime.tryParse(r.updatedAt)?.millisecondsSinceEpoch;
  if (u != null && u > 0) candidates.add(u);
  if (r.payload.updatedAt != null && r.payload.updatedAt! > 0) {
    candidates.add(r.payload.updatedAt!);
  }
  if (r.payload.savedAt != null && r.payload.savedAt! > 0) {
    candidates.add(r.payload.savedAt!);
  }
  if (r.payload.watchLaterAt != null && r.payload.watchLaterAt! > 0) {
    candidates.add(r.payload.watchLaterAt!);
  }
  for (final h in r.payload.highlights) {
    if (h.createdAt != null && h.createdAt! > 0) candidates.add(h.createdAt!);
  }
  for (final s in r.payload.screenshots) {
    if (s.createdAt != null && s.createdAt! > 0) candidates.add(s.createdAt!);
  }
  if (candidates.isEmpty) return 0;
  return candidates.reduce((a, b) => a < b ? a : b);
}

int compareWatchOrder(VaultRow a, VaultRow b, {required bool series}) {
  if (series) {
    final ea = episodeIndex(a.payload.displayTitle);
    final eb = episodeIndex(b.payload.displayTitle);
    if (ea != null && eb != null && ea != eb) return ea.compareTo(eb);
    if (ea != null && eb == null) return -1;
    if (ea == null && eb != null) return 1;
  }
  final fa = firstSeenMs(a);
  final fb = firstSeenMs(b);
  if (fa != fb) return fa.compareTo(fb);
  return a.payload.displayTitle
      .toLowerCase()
      .compareTo(b.payload.displayTitle.toLowerCase());
}

/// Playlist / series order: episode 1 → N, then oldest first.
List<VaultRow> sortWatchOrder(Iterable<VaultRow> rows) {
  final list = [...rows];
  var numbered = 0;
  for (final r in list) {
    if (episodeIndex(r.payload.displayTitle) != null) numbered++;
  }
  final series = numbered >= 2;
  list.sort((a, b) => compareWatchOrder(a, b, series: series));
  return list;
}

List<VaultRow> sortByActivityNewest(Iterable<VaultRow> rows) {
  final list = [...rows];
  list.sort((a, b) => b.activityMs.compareTo(a.activityMs));
  return list;
}

class DayBucket {
  final String label;
  final DateTime day;
  final List<VaultRow> rows;
  DayBucket({required this.label, required this.day, required this.rows});
}

String dayLabel(DateTime day, {DateTime? now}) {
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final d = DateTime(day.year, day.month, day.day);
  final diff = today.difference(d).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return DateFormat('EEEE').format(d);
  if (d.year == n.year) return DateFormat('MMM d').format(d);
  return DateFormat('MMM d, y').format(d);
}

/// [rows] should already be newest-first. Groups into day sections top → down.
List<DayBucket> groupRowsByDay(List<VaultRow> rows, {DateTime? now}) {
  final map = <DateTime, List<VaultRow>>{};
  final order = <DateTime>[];
  for (final r in rows) {
    final ms = r.activityMs;
    final dt = ms > 0
        ? DateTime.fromMillisecondsSinceEpoch(ms)
        : (now ?? DateTime.now());
    final day = DateTime(dt.year, dt.month, dt.day);
    if (!map.containsKey(day)) {
      map[day] = [];
      order.add(day);
    }
    map[day]!.add(r);
  }
  return [
    for (final d in order)
      DayBucket(label: dayLabel(d, now: now), day: d, rows: map[d]!),
  ];
}

class VideoItemGroup<T> {
  final String videoId;
  final String title;
  final String channelTitle;
  final List<T> items;
  VideoItemGroup({
    required this.videoId,
    required this.title,
    required this.channelTitle,
    required this.items,
  });
}

/// Videos newest-touched first; marks inside each video play from 0:00 down.
List<VideoItemGroup<NoteItem>> groupMarksByVideo(List<NoteItem> items) {
  final newest = <String, int>{};
  final buckets = <String, List<NoteItem>>{};
  for (final n in items) {
    buckets.putIfAbsent(n.videoId, () => []).add(n);
    final t = n.highlight.createdAt ?? 0;
    final prev = newest[n.videoId] ?? 0;
    if (t >= prev) newest[n.videoId] = t;
  }
  final ids = buckets.keys.toList()
    ..sort((a, b) => (newest[b] ?? 0).compareTo(newest[a] ?? 0));
  final out = <VideoItemGroup<NoteItem>>[];
  for (final id in ids) {
    final list = [...buckets[id]!]
      ..sort((a, b) => a.highlight.startTime.compareTo(b.highlight.startTime));
    final first = list.first;
    out.add(VideoItemGroup<NoteItem>(
      videoId: id,
      title: first.title,
      channelTitle: first.channelTitle,
      items: list,
    ));
  }
  return out;
}

/// Videos newest-touched first; shots inside each video follow watch time.
List<VideoItemGroup<ShotItem>> groupShotsByVideo(List<ShotItem> items) {
  final newest = <String, int>{};
  final buckets = <String, List<ShotItem>>{};
  for (final s in items) {
    buckets.putIfAbsent(s.videoId, () => []).add(s);
    final t = s.shot.createdAt ?? 0;
    final prev = newest[s.videoId] ?? 0;
    if (t >= prev) newest[s.videoId] = t;
  }
  final ids = buckets.keys.toList()
    ..sort((a, b) => (newest[b] ?? 0).compareTo(newest[a] ?? 0));
  final out = <VideoItemGroup<ShotItem>>[];
  for (final id in ids) {
    final list = [...buckets[id]!]
      ..sort((a, b) => a.shot.videoTime.compareTo(b.shot.videoTime));
    final first = list.first;
    out.add(VideoItemGroup<ShotItem>(
      videoId: id,
      title: first.title,
      channelTitle: first.channelTitle,
      items: list,
    ));
  }
  return out;
}

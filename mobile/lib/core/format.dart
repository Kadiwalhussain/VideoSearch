import '../models/models.dart';

String formatTime(num sec) {
  final s = sec.floor().clamp(0, 999999);
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  final r = s % 60;
  if (h > 0) {
    return '$h:${m.toString().padLeft(2, '0')}:${r.toString().padLeft(2, '0')}';
  }
  return '$m:${r.toString().padLeft(2, '0')}';
}

String activityLabel(VaultRow row) {
  final p = row.payload;
  final viewed = p.lastViewedAt ?? 0;
  var mark = 0;
  for (final h in p.highlights) {
    final t = h.createdAt ?? 0;
    if (t > mark) mark = t;
  }
  var shot = 0;
  for (final s in p.screenshots) {
    final t = s.createdAt ?? 0;
    if (t > shot) shot = t;
  }
  final engagement = [viewed, mark, shot].reduce((a, b) => a > b ? a : b);
  if (engagement > 0) {
    if (engagement == viewed && viewed >= mark && viewed >= shot) {
      return 'Watched ${relTime(viewed)}';
    }
    if (mark >= shot) return 'Marked ${relTime(mark)}';
    return 'Captured ${relTime(shot)}';
  }
  final saved = p.savedAt ?? 0;
  final queued = p.watchLaterAt ?? 0;
  if (saved > 0 || queued > 0) {
    if (saved >= queued) return 'Saved ${relTime(saved)}';
    return 'Queued ${relTime(queued)}';
  }
  final added = p.createdAt ??
      DateTime.tryParse(row.createdAt ?? '')?.millisecondsSinceEpoch ??
      0;
  if (added > 0) return 'Added ${relTime(added)}';
  return '—';
}

String relTime(int? ms) {
  if (ms == null || ms <= 0) return '—';
  var diff = DateTime.now().millisecondsSinceEpoch - ms;
  if (diff < 0) diff = 0;
  final sec = diff ~/ 1000;
  if (sec < 45) return 'just now';
  final min = sec ~/ 60;
  if (min < 60) return '${min}m ago';
  final h = min ~/ 60;
  if (h < 24) return '${h}h ago';
  final d = h ~/ 24;
  if (d < 7) return '${d}d ago';
  if (d < 30) return '${d ~/ 7}w ago';
  return '${d ~/ 30}mo ago';
}

String kindLabel(String? kind) {
  const map = {
    'drive': 'Drive',
    'docs': 'Doc',
    'slides': 'Slides',
    'sheets': 'Sheet',
    'form': 'Form',
    'pdf': 'PDF',
    'github': 'GitHub',
    'notion': 'Notion',
    'figma': 'Figma',
    'canva': 'Canva',
    'cloud': 'Cloud',
    'telegram': 'Telegram',
    'discord': 'Discord',
    'hub': 'Hub',
    'course': 'Course',
    'resource': 'Read',
    'link': 'Link',
  };
  return map[kind ?? ''] ?? 'Link';
}

bool isUsefulSource(String url, String? kind) {
  try {
    final u = Uri.parse(url);
    final host = u.host.replaceFirst(RegExp(r'^www\.'), '').toLowerCase();
    final path = u.path.isEmpty ? '/' : u.path;
    if (host == 'youtube.com' ||
        host.endsWith('.youtube.com') ||
        host == 'youtu.be' ||
        host.endsWith('.ytimg.com')) {
      return false;
    }
    const noise = {
      'google.com',
      'accounts.google.com',
      'support.google.com',
      'policies.google.com',
      'myaccount.google.com',
      'ads.google.com',
      'play.google.com',
      'maps.google.com',
      'mail.google.com',
      'news.google.com',
      'gstatic.com',
      'googleapis.com',
      'googleusercontent.com',
      'doubleclick.net',
      'schema.org',
    };
    if (noise.contains(host)) return false;
    final k = (kind ?? '').toLowerCase();
    const good = {
      'drive',
      'docs',
      'slides',
      'sheets',
      'form',
      'pdf',
      'github',
      'notion',
      'figma',
      'canva',
      'cloud',
      'telegram',
      'discord',
      'hub',
      'course',
      'resource',
    };
    if (good.contains(k)) return true;
    if (host.contains('drive.google') ||
        host.contains('docs.google') ||
        host.contains('slides.google') ||
        host.contains('sheets.google') ||
        host == 'forms.gle' ||
        host == 'sites.google.com') {
      return true;
    }
    if (host.endsWith('.google.com')) return false;
    if (RegExp(r'\.(pdf|pptx?|docx?|xlsx?|zip)(\?|$)', caseSensitive: false)
        .hasMatch(url)) {
      return true;
    }
    return path.length > 2 && path != '/';
  } catch (_) {
    return false;
  }
}

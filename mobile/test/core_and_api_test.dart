import 'package:flutter_test/flutter_test.dart';
import 'package:videosearch_mobile/core/config.dart';
import 'package:videosearch_mobile/core/format.dart';
import 'package:videosearch_mobile/core/nav.dart';
import 'package:videosearch_mobile/core/sort.dart';
import 'package:videosearch_mobile/core/validators.dart';
import 'package:videosearch_mobile/models/models.dart';
import 'package:videosearch_mobile/services/api.dart';

void main() {
  group('AppConfig.normalizeBase', () {
    test('trims and strips trailing slash', () {
      expect(
        AppConfig.normalizeBase('  http://192.168.0.103:8787/  '),
        'http://192.168.0.103:8787',
      );
    });

    test('adds http scheme when missing', () {
      expect(
        AppConfig.normalizeBase('192.168.0.103:8787'),
        'http://192.168.0.103:8787',
      );
    });

    test('detects loopback', () {
      expect(AppConfig.isLoopbackBase('http://127.0.0.1:8787'), isTrue);
      expect(AppConfig.isLoopbackBase('http://localhost:8787'), isTrue);
      expect(AppConfig.isLoopbackBase('http://192.168.0.103:8787'), isFalse);
    });
  });

  group('Validators', () {
    test('email', () {
      expect(Validators.email('a@b.com'), isNull);
      expect(Validators.email('bad'), isNotNull);
      expect(Validators.email(''), isNotNull);
    });

    test('password', () {
      expect(Validators.password('12345'), isNotNull);
      expect(Validators.password('123456'), isNull);
    });

    test('apiBase', () {
      expect(Validators.apiBase('http://192.168.0.1:8787'), isNull);
      expect(Validators.apiBase(''), isNotNull);
    });
  });

  group('nav + sources', () {
    test('videoLocation stays in-app', () {
      expect(
        videoLocation('abc', tab: 'marks', mark: 'h1', t: 12),
        '/video/abc?tab=marks&mark=h1&t=12',
      );
    });

    test('videoLocation play-at-time only', () {
      expect(videoLocation('xyz', t: 90), '/video/xyz?t=90');
    });

    test('useful source keeps Drive, drops YouTube', () {
      expect(
        isUsefulSource('https://drive.google.com/file/d/x', 'drive'),
        isTrue,
      );
      expect(
        isUsefulSource('https://www.youtube.com/watch?v=abc', 'link'),
        isFalse,
      );
    });
  });

  group('formatTime', () {
    test('mm:ss and h:mm:ss', () {
      expect(formatTime(65), '1:05');
      expect(formatTime(3661), '1:01:01');
      expect(formatTime(0), '0:00');
    });
  });

  group('sort / watch order', () {
    test('episodeIndex reads lecture and part numbers', () {
      expect(episodeIndex('OS Lecture 12 — Paging'), 12);
      expect(episodeIndex('Lecture No.2 | Seerat'), 2);
      expect(episodeIndex('Episode 4: Recursion'), 4);
      expect(episodeIndex('Part 3 of 10'), 3);
      expect(episodeIndex('01 - Introduction'), 1);
      expect(episodeIndex('Random vlog in Paris'), isNull);
    });

    test('sortWatchOrder puts lecture 1 before 3 even if 3 is newer', () {
      VaultRow row(String id, String title, int updated) => VaultRow(
            videoId: id,
            updatedAt: '',
            payload: VaultPayload(
              videoId: id,
              videoTitle: title,
              updatedAt: updated,
            ),
          );
      final sorted = sortWatchOrder([
        row('c', 'OS Lecture 3', 900),
        row('a', 'OS Lecture 1', 100),
        row('b', 'OS Lecture 2', 800),
      ]);
      expect(sorted.map((r) => r.videoId).toList(), ['a', 'b', 'c']);
    });

    test('groupRowsByDay newest day first with labels', () {
      final now = DateTime(2026, 8, 18, 15);
      VaultRow row(String id, DateTime when) => VaultRow(
            videoId: id,
            updatedAt: '',
            payload: VaultPayload(
              videoId: id,
              videoTitle: id,
              updatedAt: when.millisecondsSinceEpoch,
            ),
          );
      final list = sortByActivityNewest([
        row('old', DateTime(2026, 8, 16, 10)),
        row('today', DateTime(2026, 8, 18, 9)),
        row('yest', DateTime(2026, 8, 17, 20)),
      ]);
      final buckets = groupRowsByDay(list, now: now);
      expect(buckets.map((b) => b.label).toList(),
          ['Today', 'Yesterday', dayLabel(DateTime(2026, 8, 16), now: now)]);
      expect(buckets.first.rows.first.videoId, 'today');
    });

    test('groupMarksByVideo sorts marks by video time', () {
      NoteItem n(String vid, double t, int created) => NoteItem(
            highlight: Highlight(
              id: '$vid-$t',
              startTime: t,
              createdAt: created,
            ),
            videoId: vid,
            title: vid,
            videoUrl: '',
          );
      final groups = groupMarksByVideo([
        n('v2', 40, 10),
        n('v1', 90, 50),
        n('v1', 10, 20),
      ]);
      expect(groups.map((g) => g.videoId).toList(), ['v1', 'v2']);
      expect(
        groups.first.items.map((x) => x.highlight.startTime).toList(),
        [10, 90],
      );
    });
  });

  group('VaultApi.mediaUrl', () {
    final api = VaultApi();

    test('rewrites localhost vault shot URL to LAN base', () {
      final out = api.mediaUrl(
        'http://localhost:8787/api/vault/shot/vid/sid',
        'tok123',
        apiBase: 'http://192.168.0.103:8787',
      );
      expect(out.startsWith('http://192.168.0.103:8787/api/vault/shot/'), isTrue);
      expect(out.contains('token=tok123'), isTrue);
      expect(out.contains('localhost'), isFalse);
    });

    test('relative path becomes absolute + token', () {
      final out = api.mediaUrl(
        '/api/vault/shot/v/s',
        'abc',
        apiBase: 'http://192.168.0.103:8787',
      );
      expect(
        out,
        'http://192.168.0.103:8787/api/vault/shot/v/s?token=abc',
      );
    });

    test('account:// pointers are not used as image URLs', () {
      expect(
        api.mediaUrl(
          'account://u_x/vid/shot1',
          'tok',
          apiBase: 'http://192.168.0.103:8787',
        ),
        '',
      );
    });

    test('data urls pass through', () {
      expect(
        api.mediaUrl('data:image/png;base64,xxx', 't'),
        'data:image/png;base64,xxx',
      );
    });

    test('shotProxyUrl', () {
      final u = api.shotProxyUrl(
        videoId: 'vid1',
        shotId: 'shot1',
        token: 't',
        apiBase: 'http://192.168.0.103:8787',
      );
      expect(u.contains('/api/vault/shot/vid1/shot1'), isTrue);
      expect(u.contains('token=t'), isTrue);
    });
  });

  group('models', () {
    test('VaultPayload displayTitle', () {
      final p = VaultPayload(videoId: 'abc', videoTitle: 'Hello');
      expect(p.displayTitle, 'Hello');
      final empty = VaultPayload(videoId: 'abc', videoTitle: 'abc');
      expect(empty.displayTitle, 'abc');
    });

    test('VaultRow.fromJson skips corrupt nested items', () {
      final r = VaultRow.fromJson({
        'video_id': 'v2',
        'updated_at': '2024-01-01T00:00:00.000Z',
        'payload': {
          'videoId': 'v2',
          'highlights': [
            {'id': 'h1', 'startTime': 3, 'note': 'ok'},
            'bad',
            12,
            null,
          ],
          'screenshots': [
            {'id': 's1', 'videoTime': 1},
            {'note': 'no id'},
          ],
        },
      });
      expect(r.videoId, 'v2');
      expect(r.payload.highlights.length, 1);
      expect(r.payload.screenshots.length, 1);
    });

    test('VaultRow.fromJson maps snake_case', () {
      final r = VaultRow.fromJson({
        'video_id': 'v1',
        'updated_at': '2024-01-01T00:00:00.000Z',
        'payload': {
          'videoId': 'v1',
          'videoTitle': 'T',
          'highlights': [
            {'id': 'h1', 'startTime': 12, 'note': 'n'},
          ],
          'screenshots': [
            {'id': 's1', 'videoTime': 5, 'note': '', 'imageUrl': '/api/x'},
          ],
        },
      });
      expect(r.videoId, 'v1');
      expect(r.payload.highlights.length, 1);
      expect(r.payload.screenshots.first.imageUrl, '/api/x');
    });
  });
}

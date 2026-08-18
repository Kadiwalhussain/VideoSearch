import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:videosearch_mobile/models/models.dart';
import 'package:videosearch_mobile/providers/app_state.dart';
import 'package:videosearch_mobile/screens/login_screen.dart';

void main() {
  test('playlists merge truncated duplicate names', () {
    final app = AppState();
    app.rows = [
      VaultRow(
        videoId: 'a',
        updatedAt: '',
        payload: VaultPayload(
          videoId: 'a',
          playlists: [
            '(HD) Lecture No.2 | Seerat Un Nabi | Jumma Bayan | 27 Sep, 2019 | Mufti Syed Ad',
          ],
        ),
      ),
      VaultRow(
        videoId: 'b',
        updatedAt: '',
        payload: VaultPayload(
          videoId: 'b',
          playlists: [
            '(HD) Lecture No.2 | Seerat Un Nabi | Jumma Bayan | 27 Sep, 2019 | Mufti Syed Adnan Kakakhail',
          ],
        ),
      ),
    ];
    expect(app.playlists.length, 1);
    expect(app.playlists.first.rows.length, 2);
    expect(
      app.playlists.first.name.contains('Kakakhail'),
      isTrue,
    );
  });

  test('playlists put latest video on top', () {
    final app = AppState();
    app.rows = [
      VaultRow(
        videoId: 'c',
        updatedAt: '2024-03-01T00:00:00.000Z',
        payload: VaultPayload(
          videoId: 'c',
          videoTitle: 'OS Lecture 3',
          playlists: ['OS'],
          updatedAt: 300,
        ),
      ),
      VaultRow(
        videoId: 'a',
        updatedAt: '2024-01-01T00:00:00.000Z',
        payload: VaultPayload(
          videoId: 'a',
          videoTitle: 'OS Lecture 1',
          playlists: ['OS'],
          updatedAt: 100,
        ),
      ),
      VaultRow(
        videoId: 'b',
        updatedAt: '2024-06-01T00:00:00.000Z',
        payload: VaultPayload(
          videoId: 'b',
          videoTitle: 'OS Lecture 2',
          playlists: ['OS'],
          updatedAt: 999999,
        ),
      ),
    ];
    expect(
      app.playlists.first.rows.map((r) => r.videoId).toList(),
      ['b', 'c', 'a'],
    );
  });

  test('AppState defaults', () {
    final app = AppState();
    expect(app.session, isNull);
    expect(app.rows, isEmpty);
  });

  testWidgets('login screen renders without throwing', (tester) async {
    final app = AppState();
    app.forceBootstrapped();
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: app,
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pump();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    await tester.pumpAndSettle();
  });
}

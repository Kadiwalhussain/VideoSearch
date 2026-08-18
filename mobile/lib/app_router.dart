import 'package:go_router/go_router.dart';
import 'providers/app_state.dart';
import 'screens/home_screen.dart';
import 'screens/library_screen.dart';
import 'screens/login_screen.dart';
import 'screens/marks_screen.dart';
import 'screens/more_screen.dart';
import 'screens/playlists_screen.dart';
import 'screens/search_screen.dart';
import 'screens/shell_screen.dart';
import 'screens/shots_screen.dart';
import 'screens/video_detail_screen.dart';

GoRouter createRouter(AppState app) {
  return GoRouter(
    // Start on login so cold start never builds the shell with a null session
    // (physical iOS can flash / hang on a blank shell before redirect).
    initialLocation: '/login',
    refreshListenable: app,
    redirect: (context, state) {
      // Stay put while splash overlay is covering the tree.
      if (!app.bootstrapped) return null;
      final loggedIn = app.session != null;
      final onLogin = state.matchedLocation == '/login';
      if (!loggedIn && !onLogin) return '/login';
      if (loggedIn && onLogin) return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            ShellScreen(navigationShell: navigationShell),
        branches: [
          // 0 Home
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          // 1 Marks — main product
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/marks',
                builder: (context, state) => const MarksScreen(),
              ),
            ],
          ),
          // 2 Shots — main product
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/shots',
                builder: (context, state) => const ShotsScreen(),
              ),
            ],
          ),
          // 3 Library
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/library',
                builder: (context, state) => const LibraryScreen(),
              ),
            ],
          ),
          // 4 More (search, playlists, settings)
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/more',
                builder: (context, state) => const MoreScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/video/:id',
        builder: (context, state) {
          final q = state.uri.queryParameters;
          return VideoDetailScreen(
            videoId: state.pathParameters['id'] ?? '',
            initialTab: q['tab'],
            highlightId: q['mark'],
            shotId: q['shot'],
            startSeconds: double.tryParse(q['t'] ?? '') ?? 0,
          );
        },
      ),
      GoRoute(
        path: '/playlist',
        builder: (context, state) => PlaylistDetailScreen(
          name: state.uri.queryParameters['name'] ?? '',
        ),
      ),
      GoRoute(
        path: '/search',
        builder: (context, state) => SearchScreen(
          initialQuery: state.uri.queryParameters['q'],
        ),
      ),
      GoRoute(
        path: '/playlists',
        builder: (context, state) => const PlaylistsScreen(),
      ),
    ],
  );
}

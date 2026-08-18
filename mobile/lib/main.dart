import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'app_router.dart';
import 'core/theme.dart';
import 'providers/app_state.dart';

void main() {
  // Catch every error so a silent crash never leaves a pure white screen.
  runZonedGuarded(() {
    WidgetsFlutterBinding.ensureInitialized();

    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      debugPrint('FlutterError: ${details.exceptionAsString()}');
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      debugPrint('PlatformError: $error\n$stack');
      return true;
    };

    ErrorWidget.builder = (details) {
      return Material(
        color: const Color(0xFF05080F),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, color: Color(0xFFFB7185), size: 40),
                const SizedBox(height: 12),
                const Text(
                  'Something went wrong',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  details.exceptionAsString(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      );
    };

    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
    );

    // Paint immediately — never await keychain / network before runApp.
    final app = AppState();
    runApp(VideoSearchApp(app: app));

    // Bootstrap only after the first frame is on screen (splash visible).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(app.bootstrap());
    });
  }, (error, stack) {
    debugPrint('Uncaught zone error: $error\n$stack');
  });
}

class VideoSearchApp extends StatelessWidget {
  final AppState app;
  const VideoSearchApp({super.key, required this.app});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: app,
      child: _AppRoot(app: app),
    );
  }
}

class _AppRoot extends StatefulWidget {
  final AppState app;
  const _AppRoot({required this.app});

  @override
  State<_AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<_AppRoot> {
  // Created once. Starts at /login so we never flash a logged-in shell
  // before redirect while session is still null.
  late final router = createRouter(widget.app);

  @override
  void initState() {
    super.initState();
    // Absolute failsafe: if bootstrap never finishes, show UI after 2s.
    Timer(const Duration(seconds: 2), () {
      if (!widget.app.bootstrapped && mounted) {
        debugPrint('bootstrap failsafe: forcing UI');
        widget.app.forceBootstrapped();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, state, _) {
        // Single MaterialApp tree always — swapping MaterialApp widgets
        // can flash white on some iOS devices.
        return MaterialApp.router(
          title: 'VideoSearch',
          debugShowCheckedModeBanner: false,
          theme: VSTheme.light(),
          darkTheme: VSTheme.dark(),
          themeMode: state.dark ? ThemeMode.dark : ThemeMode.light,
          routerConfig: router,
          builder: (context, child) {
            if (!state.bootstrapped) {
              return const _BootSplash();
            }
            // Ensure we never paint a null child (go_router edge cases).
            return child ?? const _BootSplash();
          },
        );
      },
    );
  }
}

class _BootSplash extends StatelessWidget {
  const _BootSplash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFF05080F),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _LogoMark(),
            SizedBox(height: 20),
            Text(
              'VideoSearch',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
                color: Colors.white,
              ),
            ),
            SizedBox(height: 16),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.4,
                color: Color(0xFF34D399),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LogoMark extends StatelessWidget {
  const _LogoMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 72,
      height: 72,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          colors: [Color(0xFF34D399), Color(0xFF10B981)],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF34D399).withValues(alpha: 0.35),
            blurRadius: 24,
          ),
        ],
      ),
      child: const Icon(
        Icons.play_circle_fill_rounded,
        color: Color(0xFF04140C),
        size: 40,
      ),
    );
  }
}

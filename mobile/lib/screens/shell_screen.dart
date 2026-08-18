import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';

class ShellScreen extends StatelessWidget {
  final StatefulNavigationShell navigationShell;
  const ShellScreen({super.key, required this.navigationShell});

  void _go(int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final marks = app.stats.marks;
    final shots = app.stats.shots;

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: _go,
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard_rounded),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: marks > 0,
              label: Text(marks > 99 ? '99+' : '$marks'),
              child: const Icon(Icons.bookmark_border_rounded),
            ),
            selectedIcon: Badge(
              isLabelVisible: marks > 0,
              label: Text(marks > 99 ? '99+' : '$marks'),
              child: const Icon(Icons.bookmark_rounded),
            ),
            label: 'Marks',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: shots > 0,
              label: Text(shots > 99 ? '99+' : '$shots'),
              child: const Icon(Icons.camera_alt_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: shots > 0,
              label: Text(shots > 99 ? '99+' : '$shots'),
              child: const Icon(Icons.camera_alt_rounded),
            ),
            label: 'Shots',
          ),
          const NavigationDestination(
            icon: Icon(Icons.video_library_outlined),
            selectedIcon: Icon(Icons.video_library_rounded),
            label: 'Library',
          ),
          const NavigationDestination(
            icon: Icon(Icons.more_horiz),
            selectedIcon: Icon(Icons.more_horiz),
            label: 'More',
          ),
        ],
      ),
    );
  }
}

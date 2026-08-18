import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../services/share_helper.dart';
import '../widgets/video_tile.dart';

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key});

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen>
    with SingleTickerProviderStateMixin {
  late final TabController tabs;

  @override
  void initState() {
    super.initState();
    tabs = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    tabs.dispose();
    super.dispose();
  }

  List<VaultRow> _list(AppState app, int i) {
    switch (i) {
      case 1:
        return app.savedRows;
      case 2:
        return app.watchLaterRows;
      case 3:
        return app.history;
      default:
        return app.history;
    }
  }

  bool _groupByDay(int tab) => tab == 0 || tab == 3;

  Future<void> _share(AppState app, VaultRow r) async {
    try {
      final url = await app.shareVideo(r.videoId);
      if (!mounted) return;
      await ShareHelper.shareText(
        context,
        text: '${r.payload.displayTitle}\n$url',
        subject: r.payload.displayTitle,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _delete(AppState app, VaultRow r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete video?'),
        content: Text(
          '“${r.payload.displayTitle}” and all marks/shots will be removed from your account vault.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok == true) {
      try {
        await app.deleteVideo(r.videoId);
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('$e')));
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
        bottom: TabBar(
          controller: tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            Tab(text: 'All (${app.rows.length})'),
            Tab(text: 'Saved (${app.savedRows.length})'),
            Tab(text: 'Later (${app.watchLaterRows.length})'),
            const Tab(text: 'History'),
          ],
        ),
      ),
      body: TabBarView(
        controller: tabs,
        children: List.generate(4, (tab) {
          final list = _list(app, tab);
          if (app.loading && app.rows.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          if (list.isEmpty) {
            return Center(
              child: Text(
                tab == 1
                    ? 'Nothing saved yet — tap bookmark on a video'
                    : tab == 2
                        ? 'Watch later is empty'
                        : 'No videos in this account vault yet',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.5),
                  fontWeight: FontWeight.w600,
                ),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () => app.refreshVault(force: true),
            child: VideoSectionList(
              rows: list,
              groupByDay: _groupByDay(tab),
              onTap: (r) => context.push('/video/${r.videoId}'),
              onShare: (r) => _share(app, r),
              onDelete: (r) => _delete(app, r),
            ),
          );
        }),
      ),
    );
  }
}

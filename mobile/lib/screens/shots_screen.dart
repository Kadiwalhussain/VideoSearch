import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../core/sort.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/glass.dart';
import '../widgets/shot_image.dart';
import '../widgets/video_tile.dart';

class ShotsScreen extends StatefulWidget {
  const ShotsScreen({super.key});

  @override
  State<ShotsScreen> createState() => _ShotsScreenState();
}

class _ShotsScreenState extends State<ShotsScreen> {
  final searchCtrl = TextEditingController();

  @override
  void dispose() {
    searchCtrl.dispose();
    super.dispose();
  }

  List<ShotItem> _filtered(List<ShotItem> all) {
    final q = searchCtrl.text.trim().toLowerCase();
    if (q.isEmpty) return all;
    return all.where((s) {
      return s.title.toLowerCase().contains(q) ||
          s.channelTitle.toLowerCase().contains(q) ||
          s.shot.note.toLowerCase().contains(q) ||
          formatTime(s.shot.videoTime).contains(q);
    }).toList();
  }

  void _playInApp(ShotItem s) {
    context.push(
      videoLocation(
        s.videoId,
        tab: 'shots',
        shot: s.shot.id,
        t: s.shot.videoTime,
      ),
    );
  }

  Future<void> _delete(AppState app, ShotItem s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete shot?'),
        content: const Text('This screenshot will be removed from your vault.'),
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
        await app.deleteShot(s.videoId, s.shot.id);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Shot deleted')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('$e')));
        }
      }
    }
  }

  void _openLightbox(List<ShotItem> list, int index) {
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Close',
      barrierColor: Colors.black.withValues(alpha: 0.94),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (ctx, a1, a2) {
        return _ShotLightbox(
          items: list,
          initialIndex: index,
          imageUrl: (s) => context.read<AppState>().shotImageUrl(s),
          onJump: (s) async => _playInApp(s),
          onDelete: (s) => _delete(context.read<AppState>(), s),
          onOpenVideo: (s) {
            Navigator.of(ctx).pop();
            context.push(
              videoLocation(s.videoId, tab: 'shots', shot: s.shot.id),
            );
          },
        );
      },
      transitionBuilder: (ctx, a1, a2, child) {
        return FadeTransition(
          opacity: CurvedAnimation(parent: a1, curve: Curves.easeOut),
          child: child,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final all = app.allShots;
    final list = _filtered(all);
    final cs = Theme.of(context).colorScheme;
    final videos = list.map((s) => s.videoId).toSet().length;
    final w = MediaQuery.sizeOf(context).width;
    final cols = w >= 1000 ? 4 : (w >= 640 ? 3 : 2);

    return Scaffold(
      body: NestedScrollView(
        headerSliverBuilder: (context, inner) => [
          SliverAppBar(
            floating: true,
            pinned: true,
            toolbarHeight: 48,
            title: const Text('Shots'),
            titleTextStyle: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                  letterSpacing: -0.3,
                  color: cs.onSurface,
                ),
            actions: [
              IconButton(
                tooltip: 'Refresh',
                visualDensity: VisualDensity.compact,
                onPressed:
                    app.loading ? null : () => app.refreshVault(force: true),
                icon: app.loading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh_rounded, size: 20),
              ),
            ],
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '${all.length} shot${all.length == 1 ? '' : 's'}'
                    '${videos > 0 ? ' · $videos videos' : ''}',
                    style: TextStyle(
                      color: cs.onSurface.withValues(alpha: 0.48),
                      fontWeight: FontWeight.w600,
                      fontSize: 11.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  GlassCard(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 2, vertical: 0),
                    radius: BorderRadius.circular(14),
                    child: TextField(
                      controller: searchCtrl,
                      onChanged: (_) => setState(() {}),
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Search shots…',
                        hintStyle: TextStyle(
                          fontSize: 13.5,
                          color: cs.onSurface.withValues(alpha: 0.35),
                        ),
                        isDense: true,
                        contentPadding:
                            const EdgeInsets.symmetric(vertical: 10),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        filled: false,
                        prefixIcon: Icon(
                          Icons.search_rounded,
                          size: 18,
                          color: cs.onSurface.withValues(alpha: 0.4),
                        ),
                        prefixIconConstraints: const BoxConstraints(
                          minWidth: 40,
                          minHeight: 36,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        body: all.isEmpty
            ? _EmptyShots(onRefresh: () => app.refreshVault(force: true))
            : list.isEmpty
                ? Center(
                    child: Text(
                      'No shots match',
                      style: TextStyle(
                        color: cs.onSurface.withValues(alpha: 0.45),
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: () => app.refreshVault(force: true),
                    child: _ShotsGroupedGrid(
                      groups: groupShotsByVideo(list),
                      cols: cols,
                      imageUrl: app.shotImageUrl,
                      onOpen: (flat, i) => _openLightbox(flat, i),
                    ),
                  ),
      ),
    );
  }
}

class _ShotsGroupedGrid extends StatelessWidget {
  final List<VideoItemGroup<ShotItem>> groups;
  final int cols;
  final String Function(ShotItem) imageUrl;
  final void Function(List<ShotItem> flat, int index) onOpen;

  const _ShotsGroupedGrid({
    required this.groups,
    required this.cols,
    required this.imageUrl,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    final flat = [for (final g in groups) ...g.items];
    final slivers = <Widget>[];
    var offset = 0;
    for (final g in groups) {
      final base = offset;
      slivers.add(
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 0),
          sliver: SliverToBoxAdapter(
            child: VideoGroupHeader(
              videoId: g.videoId,
              title: g.title,
              channelTitle: g.channelTitle,
              meta: '${g.items.length} shot${g.items.length == 1 ? '' : 's'}',
              onTap: () => context.push('/video/${g.videoId}?tab=shots'),
            ),
          ),
        ),
      );
      slivers.add(
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
          sliver: SliverGrid(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: cols,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 0.82,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, i) {
                final s = g.items[i];
                return _ShotCard(
                  item: s,
                  imageUrl: imageUrl(s),
                  index: base + i,
                  compactTitle: true,
                  onTap: () => onOpen(flat, base + i),
                );
              },
              childCount: g.items.length,
            ),
          ),
        ),
      );
      offset += g.items.length;
    }
    slivers.add(const SliverToBoxAdapter(child: SizedBox(height: 28)));
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: slivers,
    );
  }
}

class _ShotCard extends StatelessWidget {
  final ShotItem item;
  final String imageUrl;
  final int index;
  final bool compactTitle;
  final VoidCallback onTap;

  const _ShotCard({
    required this.item,
    required this.imageUrl,
    required this.index,
    required this.onTap,
    this.compactTitle = false,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final s = item;
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            color: dark ? const Color(0xFF121A2B) : Colors.white,
            border: Border.all(
              color: dark ? VSTheme.darkBorder : VSTheme.lightBorder,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(13),
                  ),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      ShotImage(
                        url: imageUrl,
                        fit: BoxFit.cover,
                        memCacheWidth: 480,
                      ),
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 44,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.transparent,
                                Colors.black.withValues(alpha: 0.62),
                              ],
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 7,
                        bottom: 7,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 7,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: VSTheme.accent.withValues(alpha: 0.95),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            formatTime(s.shot.videoTime),
                            style: const TextStyle(
                              color: VSTheme.ink,
                              fontWeight: FontWeight.w900,
                              fontSize: 10,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(9, 7, 9, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      compactTitle
                          ? (s.shot.note.trim().isEmpty
                              ? formatTime(s.shot.videoTime)
                              : s.shot.note.trim())
                          : s.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 11.5,
                        letterSpacing: -0.1,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      compactTitle
                          ? (s.shot.note.trim().isEmpty
                              ? 'Frame'
                              : formatTime(s.shot.videoTime))
                          : (s.shot.note.trim().isEmpty
                              ? 'Frame'
                              : s.shot.note.trim()),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w500,
                        color: cs.onSurface.withValues(alpha: 0.42),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    )
        .animate()
        .fadeIn(delay: (14 * (index % 12)).ms, duration: 220.ms)
        .scale(
          begin: const Offset(0.98, 0.98),
          end: const Offset(1, 1),
          curve: Curves.easeOutCubic,
        );
  }
}

class _EmptyShots extends StatelessWidget {
  final VoidCallback onRefresh;
  const _EmptyShots({required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: GlassCard(
          padding: const EdgeInsets.all(22),
          radius: BorderRadius.circular(18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [
                      VSTheme.accent.withValues(alpha: 0.25),
                      VSTheme.accent.withValues(alpha: 0.08),
                    ],
                  ),
                ),
                child: const Icon(
                  Icons.camera_alt_rounded,
                  size: 26,
                  color: VSTheme.accent,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'No shots yet',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
              const SizedBox(height: 6),
              Text(
                'On YouTube, open VideoSearch and tap Shot. If tiles are empty, sync again from the extension so images upload to the vault.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: cs.onSurface.withValues(alpha: 0.5),
                  height: 1.4,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Refresh'),
                style: FilledButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  textStyle: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShotLightbox extends StatefulWidget {
  final List<ShotItem> items;
  final int initialIndex;
  final String Function(ShotItem) imageUrl;
  final Future<void> Function(ShotItem) onJump;
  final Future<void> Function(ShotItem) onDelete;
  final void Function(ShotItem) onOpenVideo;

  const _ShotLightbox({
    required this.items,
    required this.initialIndex,
    required this.imageUrl,
    required this.onJump,
    required this.onDelete,
    required this.onOpenVideo,
  });

  @override
  State<_ShotLightbox> createState() => _ShotLightboxState();
}

class _ShotLightboxState extends State<_ShotLightbox> {
  late final PageController page;
  late int index;

  @override
  void initState() {
    super.initState();
    index = widget.initialIndex.clamp(0, widget.items.length - 1);
    page = PageController(initialPage: index);
  }

  @override
  void dispose() {
    page.dispose();
    super.dispose();
  }

  ShotItem get current => widget.items[index];

  @override
  Widget build(BuildContext context) {
    final s = current;

    return Material(
      color: Colors.transparent,
      child: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: page,
              itemCount: widget.items.length,
              onPageChanged: (i) => setState(() => index = i),
              itemBuilder: (context, i) {
                final item = widget.items[i];
                final url = widget.imageUrl(item);
                return InteractiveViewer(
                  minScale: 0.8,
                  maxScale: 4,
                  child: Center(
                    child: url.isEmpty
                        ? const Icon(Icons.camera_alt_outlined,
                            color: Colors.white54, size: 56)
                        : ShotImage(
                            url: url,
                            fit: BoxFit.contain,
                            memCacheWidth: 1200,
                            error: const Icon(
                              Icons.broken_image_outlined,
                              color: Colors.white54,
                              size: 56,
                            ),
                            placeholder: const SizedBox(
                              width: 28,
                              height: 28,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: Colors.white54,
                              ),
                            ),
                          ),
                  ),
                );
              },
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(4, 2, 4, 14),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.75),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon:
                          const Icon(Icons.close_rounded, color: Colors.white),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            s.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            '${formatTime(s.shot.videoTime)} · ${index + 1}/${widget.items.length}',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.7),
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => widget.onDelete(s),
                      icon: const Icon(Icons.delete_outline_rounded,
                          color: Colors.white70, size: 22),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 24, 14, 16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.85),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (s.shot.note.trim().isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          s.shot.note.trim(),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 13.5,
                            height: 1.35,
                          ),
                        ),
                      ),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: () {
                              Navigator.pop(context);
                              widget.onJump(s);
                            },
                            icon: const Icon(Icons.play_arrow_rounded, size: 20),
                            label: Text(
                              'Play here · ${formatTime(s.shot.videoTime)}',
                              style: const TextStyle(fontSize: 13.5),
                            ),
                            style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: const BorderSide(color: Colors.white38),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 12,
                            ),
                          ),
                          onPressed: () => widget.onOpenVideo(s),
                          child: const Text('Video'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

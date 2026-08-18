import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../core/config.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../core/sort.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/glass.dart';
import '../widgets/video_tile.dart';

class MarksScreen extends StatefulWidget {
  const MarksScreen({super.key});

  @override
  State<MarksScreen> createState() => _MarksScreenState();
}

class _MarksScreenState extends State<MarksScreen> {
  final searchCtrl = TextEditingController();
  String filter = 'all';

  @override
  void dispose() {
    searchCtrl.dispose();
    super.dispose();
  }

  List<NoteItem> _filtered(List<NoteItem> all) {
    final q = searchCtrl.text.trim().toLowerCase();
    return all.where((n) {
      final text = n.highlight.note.trim();
      if (filter == 'written' && text.isEmpty) return false;
      if (filter == 'silent' && text.isNotEmpty) return false;
      if (q.isEmpty) return true;
      return text.toLowerCase().contains(q) ||
          n.title.toLowerCase().contains(q) ||
          n.channelTitle.toLowerCase().contains(q) ||
          formatTime(n.highlight.startTime).contains(q);
    }).toList();
  }

  Color _markColor(String? color) {
    if (color == null || color.isEmpty) return VSTheme.accent;
    final c = color.trim();
    if (c.startsWith('#')) {
      try {
        var hex = c.substring(1);
        if (hex.length == 3) {
          hex = '${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}';
        }
        if (hex.length == 6) return Color(int.parse('FF$hex', radix: 16));
      } catch (_) {}
    }
    return VSTheme.accent;
  }

  void _playInApp(NoteItem n) {
    context.push(
      videoLocation(
        n.videoId,
        tab: 'marks',
        mark: n.highlight.id,
        t: n.highlight.startTime,
      ),
    );
  }

  Future<void> _delete(AppState app, NoteItem n) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete mark?'),
        content: Text(
          n.highlight.note.trim().isEmpty
              ? 'Remove mark at ${formatTime(n.highlight.startTime)}?'
              : '“${n.highlight.note.trim()}” will be removed.',
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
        await app.deleteMark(n.videoId, n.highlight.id);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Mark deleted')),
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

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final all = app.allMarks;
    final written = all.where((n) => n.highlight.note.trim().isNotEmpty).length;
    final list = _filtered(all);
    final cs = Theme.of(context).colorScheme;
    final videos = list.map((n) => n.videoId).toSet().length;

    return Scaffold(
      body: NestedScrollView(
        headerSliverBuilder: (context, inner) => [
          SliverAppBar(
            floating: true,
            pinned: true,
            toolbarHeight: 48,
            title: const Text('Marks'),
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
                    '${all.length} mark${all.length == 1 ? '' : 's'}'
                    '${written > 0 ? ' · $written notes' : ''}'
                    '${videos > 0 ? ' · $videos videos' : ''}',
                    style: TextStyle(
                      color: cs.onSurface.withValues(alpha: 0.48),
                      fontWeight: FontWeight.w600,
                      fontSize: 11.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  GlassCard(
                    padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 0),
                    radius: BorderRadius.circular(14),
                    child: TextField(
                      controller: searchCtrl,
                      onChanged: (_) => setState(() {}),
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                      decoration: InputDecoration(
                        hintText: 'Search marks…',
                        hintStyle: TextStyle(
                          fontSize: 13.5,
                          color: cs.onSurface.withValues(alpha: 0.35),
                        ),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 10),
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
                  const SizedBox(height: 8),
                  FilterPills(
                    items: const [
                      ('all', 'All'),
                      ('written', 'Notes'),
                      ('silent', 'Silent'),
                    ],
                    selected: filter,
                    onSelect: (id) => setState(() => filter = id),
                  ),
                ],
              ),
            ),
          ),
        ],
        body: all.isEmpty
            ? _EmptyMarks(onRefresh: () => app.refreshVault(force: true))
            : list.isEmpty
                ? Center(
                    child: Text(
                      'No marks match',
                      style: TextStyle(
                        color: cs.onSurface.withValues(alpha: 0.45),
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: () => app.refreshVault(force: true),
                    child: _MarksGroupedList(
                      groups: groupMarksByVideo(list),
                      markColor: _markColor,
                      onJump: (n) async => _playInApp(n),
                      onDelete: (n) => _delete(app, n),
                    ),
                  ),
      ),
    );
  }
}

class _MarksGroupedList extends StatelessWidget {
  final List<VideoItemGroup<NoteItem>> groups;
  final Color Function(String?) markColor;
  final Future<void> Function(NoteItem) onJump;
  final Future<void> Function(NoteItem) onDelete;

  const _MarksGroupedList({
    required this.groups,
    required this.markColor,
    required this.onJump,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        for (final g in groups)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 4),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, i) {
                  if (i == 0) {
                    return VideoGroupHeader(
                      videoId: g.videoId,
                      title: g.title,
                      channelTitle: g.channelTitle,
                      meta:
                          '${g.items.length} mark${g.items.length == 1 ? '' : 's'}',
                      onTap: () => context.push('/video/${g.videoId}?tab=marks'),
                    );
                  }
                  final n = g.items[i - 1];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _MarkRow(
                      item: n,
                      color: markColor(n.highlight.color),
                      hasNote: n.highlight.note.trim().isNotEmpty,
                      index: i - 1,
                      showVideoTitle: false,
                      onJump: () => onJump(n),
                      onOpen: () => context.push(
                        videoLocation(
                          n.videoId,
                          tab: 'marks',
                          mark: n.highlight.id,
                          t: n.highlight.startTime,
                        ),
                      ),
                      onDelete: () => onDelete(n),
                    ),
                  );
                },
                childCount: g.items.length + 1,
              ),
            ),
          ),
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
      ],
    );
  }
}

/// Compact mark row — dense, clean, premium.
class _MarkRow extends StatelessWidget {
  final NoteItem item;
  final Color color;
  final bool hasNote;
  final int index;
  final bool showVideoTitle;
  final VoidCallback onJump;
  final VoidCallback onOpen;
  final VoidCallback onDelete;

  const _MarkRow({
    required this.item,
    required this.color,
    required this.hasNote,
    required this.index,
    required this.onJump,
    required this.onOpen,
    required this.onDelete,
    this.showVideoTitle = true,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final n = item;
    final note = n.highlight.note.trim();

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFF121A2B)
                : Colors.white,
            border: Border.all(
              color: hasNote
                  ? color.withValues(alpha: 0.28)
                  : (Theme.of(context).brightness == Brightness.dark
                      ? VSTheme.darkBorder
                      : VSTheme.lightBorder),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 6, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Compact thumb + time
                GestureDetector(
                  onTap: onOpen,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: SizedBox(
                      width: 76,
                      height: 54,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          CachedNetworkImage(
                            imageUrl: AppConfig.ytThumb(n.videoId),
                            fit: BoxFit.cover,
                            memCacheWidth: 200,
                            placeholder: (context, url) => Container(
                              color: cs.surfaceContainerHighest,
                            ),
                            errorWidget: (context, url, err) => Container(
                              color: cs.surfaceContainerHighest,
                              child: Icon(
                                Icons.play_circle_outline,
                                size: 18,
                                color: cs.onSurface.withValues(alpha: 0.3),
                              ),
                            ),
                          ),
                          Container(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  Colors.black.withValues(alpha: 0.05),
                                  Colors.black.withValues(alpha: 0.55),
                                ],
                              ),
                            ),
                          ),
                          Positioned(
                            left: 4,
                            bottom: 4,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 5,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: color,
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: Text(
                                formatTime(n.highlight.startTime),
                                style: const TextStyle(
                                  color: Color(0xFF04140C),
                                  fontWeight: FontWeight.w900,
                                  fontSize: 9.5,
                                  height: 1.1,
                                  fontFeatures: [FontFeature.tabularFigures()],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                // Text column
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (showVideoTitle) ...[
                        Text(
                          n.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12.5,
                            height: 1.2,
                            letterSpacing: -0.15,
                          ),
                        ),
                        const SizedBox(height: 2),
                      ],
                      if (hasNote)
                        Text(
                          note,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: FontWeight.w500,
                            fontSize: 12,
                            height: 1.3,
                            color: cs.onSurface.withValues(alpha: 0.78),
                          ),
                        )
                      else
                        Text(
                          n.channelTitle.isNotEmpty
                              ? n.channelTitle
                              : 'Silent mark',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: FontWeight.w500,
                            fontSize: 11.5,
                            fontStyle: FontStyle.italic,
                            color: cs.onSurface.withValues(alpha: 0.4),
                          ),
                        ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          if (n.channelTitle.isNotEmpty && hasNote) ...[
                            Flexible(
                              child: Text(
                                n.channelTitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w600,
                                  color: cs.onSurface.withValues(alpha: 0.38),
                                ),
                              ),
                            ),
                            if (n.highlight.createdAt != null)
                              Text(
                                ' · ',
                                style: TextStyle(
                                  fontSize: 10.5,
                                  color: cs.onSurface.withValues(alpha: 0.28),
                                ),
                              ),
                          ],
                          if (n.highlight.createdAt != null)
                            Text(
                              relTime(n.highlight.createdAt),
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w600,
                                color: cs.onSurface.withValues(alpha: 0.35),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                // Compact actions
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _MiniIcon(
                      icon: Icons.play_arrow_rounded,
                      color: color,
                      tooltip: 'Play in app',
                      onTap: onJump,
                    ),
                    _MiniIcon(
                      icon: Icons.delete_outline_rounded,
                      color: cs.error.withValues(alpha: 0.75),
                      tooltip: 'Delete',
                      onTap: onDelete,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    )
        .animate()
        .fadeIn(delay: (16 * (index % 14)).ms, duration: 220.ms)
        .slideY(begin: 0.02, end: 0, curve: Curves.easeOutCubic);
  }
}

class _MiniIcon extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback onTap;

  const _MiniIcon({
    required this.icon,
    required this.color,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(5),
          child: Icon(icon, size: 17, color: color),
        ),
      ),
    );
  }
}

class _EmptyMarks extends StatelessWidget {
  final VoidCallback onRefresh;
  const _EmptyMarks({required this.onRefresh});

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
                  Icons.bookmark_add_rounded,
                  size: 26,
                  color: VSTheme.accent,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'No marks yet',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
              const SizedBox(height: 6),
              Text(
                'On YouTube, open VideoSearch and tap Mark.',
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

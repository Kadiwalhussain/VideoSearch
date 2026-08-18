import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../core/config.dart';
import '../core/format.dart';
import '../core/sort.dart';
import '../core/theme.dart';
import '../models/models.dart';
import 'glass.dart';

class VideoTile extends StatelessWidget {
  final VaultRow row;
  final VoidCallback onTap;
  final VoidCallback? onShare;
  final VoidCallback? onDelete;
  final int index;
  final bool compact;

  const VideoTile({
    super.key,
    required this.row,
    required this.onTap,
    this.onShare,
    this.onDelete,
    this.index = 0,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final p = row.payload;
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;

    return GlassCard(
      margin: EdgeInsets.only(bottom: compact ? 0 : 14),
      padding: EdgeInsets.zero,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Cinema thumb ──
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  CachedNetworkImage(
                    imageUrl: AppConfig.ytThumb(row.videoId),
                    fit: BoxFit.cover,
                    memCacheWidth: 800,
                    placeholder: (context, url) => Container(
                      color: dark
                          ? const Color(0xFF0A101C)
                          : const Color(0xFFE2E8F0),
                    ),
                    errorWidget: (context, url, error) => Container(
                      color: dark
                          ? const Color(0xFF0A101C)
                          : const Color(0xFFE2E8F0),
                      child: Icon(
                        Icons.play_circle_outline_rounded,
                        size: 44,
                        color: cs.onSurface.withValues(alpha: 0.25),
                      ),
                    ),
                  ),
                  // Cinematic gradient
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        stops: const [0.35, 1],
                        colors: [
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.72),
                        ],
                      ),
                    ),
                  ),
                  // Play orb
                  Center(
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.14),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.28),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.25),
                            blurRadius: 16,
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 28,
                      ),
                    ),
                  ),
                  // Bottom meta chips
                  Positioned(
                    left: 10,
                    right: 10,
                    bottom: 10,
                    child: Row(
                      children: [
                        if (p.markCount > 0)
                          _ThumbChip(
                            icon: Icons.bookmark_rounded,
                            label: '${p.markCount}',
                          ),
                        if (p.shotCount > 0) ...[
                          const SizedBox(width: 6),
                          _ThumbChip(
                            icon: Icons.camera_alt_rounded,
                            label: '${p.shotCount}',
                          ),
                        ],
                        const Spacer(),
                        if (p.saved)
                          const _ThumbChip(
                            icon: Icons.bookmark,
                            label: '',
                            accent: true,
                          ),
                        if (p.watchLater) ...[
                          const SizedBox(width: 6),
                          const _ThumbChip(
                            icon: Icons.schedule_rounded,
                            label: '',
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          // ── Body ──
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.displayTitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14.5,
                          height: 1.28,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 5),
                      if (p.channelTitle.isNotEmpty)
                        Text(
                          p.channelTitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: cs.onSurface.withValues(alpha: 0.5),
                          ),
                        ),
                      const SizedBox(height: 3),
                      Text(
                        activityLabel(row),
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: cs.onSurface.withValues(alpha: 0.38),
                        ),
                      ),
                    ],
                  ),
                ),
                if (onShare != null)
                  _IconAction(
                    icon: Icons.ios_share_rounded,
                    onTap: onShare!,
                  ),
                if (onDelete != null)
                  _IconAction(
                    icon: Icons.delete_outline_rounded,
                    color: cs.error,
                    onTap: onDelete!,
                  ),
              ],
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 320.ms, delay: (28 * (index % 10)).ms)
        .slideY(begin: 0.04, end: 0, curve: Curves.easeOutCubic);
  }
}

class _ThumbChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool accent;

  const _ThumbChip({
    required this.icon,
    required this.label,
    this.accent = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: label.isEmpty ? 7 : 8,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 12,
            color: accent ? VSTheme.accent : Colors.white,
          ),
          if (label.isNotEmpty) ...[
            const SizedBox(width: 4),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _IconAction extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final Color? color;

  const _IconAction({
    required this.icon,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Icon(
            icon,
            size: 18,
            color: color ??
                Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
          ),
        ),
      ),
    );
  }
}

/// Responsive video grid / list.
class VideoGrid extends StatelessWidget {
  final List<VaultRow> rows;
  final void Function(VaultRow row) onTap;
  final void Function(VaultRow row)? onShare;
  final void Function(VaultRow row)? onDelete;

  const VideoGrid({
    super.key,
    required this.rows,
    required this.onTap,
    this.onShare,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final w = c.maxWidth;
        final cols = w >= 1100 ? 3 : (w >= 640 ? 2 : 1);
        if (cols == 1) {
          return VideoSectionList(
            rows: rows,
            onTap: onTap,
            onShare: onShare,
            onDelete: onDelete,
          );
        }
        return GridView.builder(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            mainAxisSpacing: 14,
            crossAxisSpacing: 14,
            // Tall enough for 16:9 + title block
            childAspectRatio: w >= 1100 ? 0.86 : 0.82,
          ),
          itemCount: rows.length,
          itemBuilder: (context, i) {
            final r = rows[i];
            return VideoTile(
              row: r,
              index: i,
              compact: true,
              onTap: () => onTap(r),
              onShare: onShare == null ? null : () => onShare!(r),
              onDelete: onDelete == null ? null : () => onDelete!(r),
            );
          },
        );
      },
    );
  }
}

/// Dense numbered row — phone-first so the list reads top → bottom.
class VideoListRow extends StatelessWidget {
  final VaultRow row;
  final VoidCallback onTap;
  final VoidCallback? onShare;
  final VoidCallback? onDelete;
  final int? number;
  final int animIndex;
  final String? timeLabel;

  const VideoListRow({
    super.key,
    required this.row,
    required this.onTap,
    this.onShare,
    this.onDelete,
    this.number,
    this.animIndex = 0,
    this.timeLabel,
  });

  @override
  Widget build(BuildContext context) {
    final p = row.payload;
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bits = <String>[
      if (p.channelTitle.isNotEmpty) p.channelTitle,
      if (p.markCount > 0)
        '${p.markCount} mark${p.markCount == 1 ? '' : 's'}',
      if (p.shotCount > 0)
        '${p.shotCount} shot${p.shotCount == 1 ? '' : 's'}',
      timeLabel ?? activityLabel(row),
    ];

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
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
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 4, 8),
              child: Row(
                children: [
                  if (number != null) ...[
                    SizedBox(
                      width: 26,
                      child: Text(
                        '$number',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2,
                          color: cs.primary.withValues(alpha: 0.9),
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                  ],
                  ClipRRect(
                    borderRadius: BorderRadius.circular(9),
                    child: SizedBox(
                      width: 104,
                      height: 58,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          CachedNetworkImage(
                            imageUrl: AppConfig.ytThumb(row.videoId),
                            fit: BoxFit.cover,
                            memCacheWidth: 280,
                            placeholder: (context, url) => Container(
                              color: dark
                                  ? const Color(0xFF0A101C)
                                  : const Color(0xFFE2E8F0),
                            ),
                            errorWidget: (context, url, error) => Container(
                              color: dark
                                  ? const Color(0xFF0A101C)
                                  : const Color(0xFFE2E8F0),
                              child: Icon(
                                Icons.play_circle_outline_rounded,
                                size: 22,
                                color: cs.onSurface.withValues(alpha: 0.28),
                              ),
                            ),
                          ),
                          DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.centerLeft,
                                end: Alignment.centerRight,
                                colors: [
                                  Colors.black.withValues(alpha: 0.05),
                                  Colors.black.withValues(alpha: 0.28),
                                ],
                              ),
                            ),
                          ),
                          Center(
                            child: Container(
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.black.withValues(alpha: 0.42),
                                border: Border.all(
                                  color: Colors.white.withValues(alpha: 0.28),
                                ),
                              ),
                              child: const Icon(
                                Icons.play_arrow_rounded,
                                color: Colors.white,
                                size: 16,
                              ),
                            ),
                          ),
                          if (p.saved || p.watchLater)
                            Positioned(
                              right: 4,
                              top: 4,
                              child: Icon(
                                p.saved
                                    ? Icons.bookmark_rounded
                                    : Icons.schedule_rounded,
                                size: 12,
                                color: p.saved
                                    ? VSTheme.accent
                                    : Colors.white.withValues(alpha: 0.9),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          p.displayTitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 13.5,
                            height: 1.25,
                            letterSpacing: -0.2,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          bits.join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: cs.onSurface.withValues(alpha: 0.42),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (onShare != null)
                    _IconAction(
                      icon: Icons.ios_share_rounded,
                      onTap: onShare!,
                    ),
                  if (onDelete != null)
                    _IconAction(
                      icon: Icons.delete_outline_rounded,
                      color: cs.error,
                      onTap: onDelete!,
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    )
        .animate()
        .fadeIn(duration: 220.ms, delay: (14 * (animIndex % 14)).ms)
        .slideY(begin: 0.03, end: 0, curve: Curves.easeOutCubic);
  }
}

class VideoSectionList extends StatelessWidget {
  final List<VaultRow> rows;
  final void Function(VaultRow row) onTap;
  final void Function(VaultRow row)? onShare;
  final void Function(VaultRow row)? onDelete;
  final bool groupByDay;
  final bool numbered;
  final EdgeInsetsGeometry padding;

  const VideoSectionList({
    super.key,
    required this.rows,
    required this.onTap,
    this.onShare,
    this.onDelete,
    this.groupByDay = false,
    this.numbered = true,
    this.padding = const EdgeInsets.fromLTRB(14, 6, 14, 28),
  });

  @override
  Widget build(BuildContext context) {
    if (!groupByDay) {
      return ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: padding,
        itemCount: rows.length,
        itemBuilder: (context, i) {
          final r = rows[i];
          return VideoListRow(
            row: r,
            number: numbered ? i + 1 : null,
            animIndex: i,
            onTap: () => onTap(r),
            onShare: onShare == null ? null : () => onShare!(r),
            onDelete: onDelete == null ? null : () => onDelete!(r),
          );
        },
      );
    }

    final buckets = groupRowsByDay(rows);
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: padding,
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, i) {
                // Flatten: header + rows per bucket
                var cursor = 0;
                var global = 0;
                for (final b in buckets) {
                  if (i == cursor) {
                    return _DayHeader(label: b.label, count: b.rows.length);
                  }
                  cursor += 1;
                  final local = i - cursor;
                  if (local >= 0 && local < b.rows.length) {
                    final r = b.rows[local];
                    return VideoListRow(
                      row: r,
                      number: numbered ? global + local + 1 : null,
                      animIndex: global + local,
                      onTap: () => onTap(r),
                      onShare: onShare == null ? null : () => onShare!(r),
                      onDelete:
                          onDelete == null ? null : () => onDelete!(r),
                    );
                  }
                  global += b.rows.length;
                  cursor += b.rows.length;
                }
                return const SizedBox.shrink();
              },
              childCount:
                  buckets.fold<int>(0, (n, b) => n + 1 + b.rows.length),
            ),
          ),
        ),
      ],
    );
  }
}

class _DayHeader extends StatelessWidget {
  final String label;
  final int count;
  const _DayHeader({required this.label, required this.count});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 12, 2, 8),
      child: Row(
        children: [
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.9,
              color: cs.onSurface.withValues(alpha: 0.42),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              height: 1,
              color: cs.onSurface.withValues(alpha: 0.08),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$count',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: cs.onSurface.withValues(alpha: 0.35),
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

/// Section label used when grouping marks / shots by video.
class VideoGroupHeader extends StatelessWidget {
  final String videoId;
  final String title;
  final String channelTitle;
  final String meta;
  final VoidCallback onTap;

  const VideoGroupHeader({
    super.key,
    required this.videoId,
    required this.title,
    required this.channelTitle,
    required this.meta,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 14, 0, 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                  width: 52,
                  height: 30,
                  child: CachedNetworkImage(
                    imageUrl: AppConfig.ytThumb(videoId),
                    fit: BoxFit.cover,
                    memCacheWidth: 140,
                    placeholder: (context, url) => Container(
                      color: dark
                          ? const Color(0xFF0A101C)
                          : const Color(0xFFE2E8F0),
                    ),
                    errorWidget: (context, url, error) => Container(
                      color: dark
                          ? const Color(0xFF0A101C)
                          : const Color(0xFFE2E8F0),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        letterSpacing: -0.15,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      [
                        if (channelTitle.isNotEmpty) channelTitle,
                        meta,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: cs.onSurface.withValues(alpha: 0.42),
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: cs.onSurface.withValues(alpha: 0.28),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

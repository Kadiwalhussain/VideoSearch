import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';
import '../core/config.dart';
import '../core/format.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../services/share_helper.dart';
import '../widgets/bio_text.dart';
import '../widgets/glass.dart';
import '../widgets/shot_image.dart';
import '../widgets/yt_player.dart';

class VideoDetailScreen extends StatefulWidget {
  final String videoId;
  final String? initialTab;
  final String? highlightId;
  final String? shotId;
  final double startSeconds;

  const VideoDetailScreen({
    super.key,
    required this.videoId,
    this.initialTab,
    this.highlightId,
    this.shotId,
    this.startSeconds = 0,
  });

  @override
  State<VideoDetailScreen> createState() => _VideoDetailScreenState();
}

class _VideoDetailScreenState extends State<VideoDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController tabs;
  late final YoutubePlayerController player;
  final bioCtrl = TextEditingController();
  bool editingBio = false;
  String? focusMarkId;
  StreamSubscription<YoutubePlayerValue>? _playerSub;
  bool _viewRecorded = false;

  static int _tabIndex(String? tab) {
    switch (tab) {
      case 'shots':
        return 1;
      case 'bio':
        return 2;
      case 'sources':
        return 3;
      default:
        return 0;
    }
  }

  @override
  void initState() {
    super.initState();
    tabs = TabController(
      length: 4,
      vsync: this,
      initialIndex: _tabIndex(widget.initialTab),
    );
    focusMarkId = widget.highlightId;
    final jumpIn = widget.startSeconds > 0 ||
        (widget.highlightId != null && widget.highlightId!.isNotEmpty) ||
        (widget.shotId != null && widget.shotId!.isNotEmpty);
    player = createVaultPlayer(
      videoId: widget.videoId,
      startSeconds: widget.startSeconds,
      autoPlay: jumpIn && widget.startSeconds > 0,
    );
    _playerSub = player.listen((value) {
      if (!mounted) return;
      if (value.playerState == PlayerState.playing) {
        _markWatched();
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<AppState>().ensureVideo(widget.videoId);
      if (widget.shotId != null && widget.shotId!.isNotEmpty) {
        tabs.index = 1;
      }
      _seekFromDeepLink();
    });
  }

  void _markWatched() {
    if (_viewRecorded) return;
    _viewRecorded = true;
    context.read<AppState>().recordView(widget.videoId);
  }

  @override
  void didUpdateWidget(covariant VideoDetailScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.videoId != widget.videoId) {
      _viewRecorded = false;
      player.loadVideoById(
        videoId: widget.videoId,
        startSeconds: widget.startSeconds > 0 ? widget.startSeconds : null,
      );
      return;
    }
    if (widget.startSeconds > 0 &&
        widget.startSeconds != oldWidget.startSeconds) {
      _playAt(widget.startSeconds);
    }
    if (widget.highlightId != null &&
        widget.highlightId != oldWidget.highlightId) {
      focusMarkId = widget.highlightId;
      tabs.index = 0;
    }
    if (widget.shotId != null && widget.shotId != oldWidget.shotId) {
      tabs.index = 1;
    }
  }

  @override
  void dispose() {
    _playerSub?.cancel();
    player.close();
    tabs.dispose();
    bioCtrl.dispose();
    super.dispose();
  }

  Future<void> _playAt(num seconds) async {
    final s = seconds.toDouble();
    if (s < 0) return;
    try {
      await player.seekTo(seconds: s, allowSeekAhead: true);
      await player.playVideo();
      _markWatched();
    } catch (_) {
      await player.loadVideoById(
        videoId: widget.videoId,
        startSeconds: s,
      );
    }
  }

  Future<void> _seekFromDeepLink() async {
    if (!mounted) return;
    if (widget.startSeconds > 0) {
      await _playAt(widget.startSeconds);
      return;
    }
    final row = context.read<AppState>().video(widget.videoId);
    if (row == null) return;
    if (widget.highlightId != null && widget.highlightId!.isNotEmpty) {
      for (final h in row.payload.highlights) {
        if (h.id == widget.highlightId) {
          await _playAt(h.startTime);
          return;
        }
      }
    }
    if (widget.shotId != null && widget.shotId!.isNotEmpty) {
      for (final s in row.payload.screenshots) {
        if (s.id == widget.shotId) {
          await _playAt(s.videoTime);
          return;
        }
      }
    }
  }

  Future<void> _open(String url) async {
    final u = Uri.parse(url);
    await launchUrl(u, mode: LaunchMode.externalApplication);
  }

  Future<void> _showShot(
    BuildContext context,
    AppState app,
    VaultRow row,
    Screenshot s,
  ) async {
    final p = row.payload;
    final img = app.shotImageUrl(
      ShotItem(
        shot: s,
        videoId: row.videoId,
        title: p.displayTitle,
        videoUrl: p.videoUrl,
        channelTitle: p.channelTitle,
      ),
    );
    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return Dialog(
          insetPadding: const EdgeInsets.all(16),
          backgroundColor: Colors.black,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AspectRatio(
                aspectRatio: 16 / 10,
                child: ShotImage(
                  url: img,
                  fit: BoxFit.contain,
                  memCacheWidth: 1200,
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 8, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (s.note.trim().isNotEmpty)
                      Text(
                        s.note.trim(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          height: 1.35,
                        ),
                      ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: () {
                              Navigator.pop(ctx);
                              _playAt(s.videoTime);
                            },
                            icon: const Icon(Icons.play_arrow_rounded),
                            label: Text(
                              'Play here · ${formatTime(s.videoTime)}',
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(ctx),
                          icon: const Icon(Icons.close, color: Colors.white70),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _playlistSheet(
    BuildContext context,
    AppState app,
    VaultRow row,
  ) async {
    final ctrl = TextEditingController();
    try {
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (ctx) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
              16,
              0,
              16,
              16 + MediaQuery.viewInsetsOf(ctx).bottom,
            ),
            child: Consumer<AppState>(
              builder: (ctx, liveApp, _) {
                final names = liveApp.playlistNames;
                final live = liveApp.video(row.videoId) ?? row;
                final current = live.payload.playlists
                    .map((n) => n.toLowerCase())
                    .toSet();
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Playlists',
                      style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 8),
                    if (names.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('No lists yet — create one below.'),
                      )
                    else
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 280),
                        child: ListView(
                          shrinkWrap: true,
                          children: [
                            for (final name in names)
                              CheckboxListTile(
                                value: current.contains(name.toLowerCase()),
                                contentPadding: EdgeInsets.zero,
                                title: Text(
                                  name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                onChanged: liveApp.actionBusy
                                    ? null
                                    : (on) async {
                                        try {
                                          if (on == true) {
                                            await liveApp.addToPlaylist(
                                              row.videoId,
                                              name,
                                            );
                                          } else {
                                            await liveApp.removeFromPlaylist(
                                              row.videoId,
                                              name,
                                            );
                                          }
                                        } catch (e) {
                                          if (context.mounted) {
                                            ScaffoldMessenger.of(context)
                                                .showSnackBar(
                                              SnackBar(content: Text('$e')),
                                            );
                                          }
                                        }
                                      },
                              ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: ctrl,
                      textInputAction: TextInputAction.done,
                      decoration: const InputDecoration(
                        labelText: 'New playlist',
                        hintText: 'e.g. Friday lectures',
                      ),
                      onSubmitted: (v) async {
                        final n = v.trim();
                        if (n.isEmpty) return;
                        try {
                          await liveApp.addToPlaylist(row.videoId, n);
                          ctrl.clear();
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('$e')),
                            );
                          }
                        }
                      },
                    ),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: liveApp.actionBusy
                          ? null
                          : () async {
                              final n = ctrl.text.trim();
                              if (n.isEmpty) return;
                              try {
                                await liveApp.addToPlaylist(row.videoId, n);
                                ctrl.clear();
                                if (ctx.mounted) Navigator.pop(ctx);
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('$e')),
                                  );
                                }
                              }
                            },
                      child: const Text('Add to new playlist'),
                    ),
                    const SizedBox(height: 8),
                  ],
                );
              },
            ),
          );
        },
      );
    } finally {
      ctrl.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final row = app.video(widget.videoId);
    final cs = Theme.of(context).colorScheme;

    if (app.loading && row == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (row == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Video')),
        body: const Center(child: Text('Video not in vault')),
      );
    }

    final p = row.payload;
    final sources = app.usefulSources(p);
    final bio = p.bioMarkdown.isNotEmpty ? p.bioMarkdown : p.bioText;

    return YoutubePlayerControllerProvider(
      controller: player,
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            p.displayTitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          actions: [
            IconButton(
              tooltip: 'Share',
              icon: const Icon(Icons.ios_share_rounded),
              onPressed: () async {
                try {
                  final url = await app.shareVideo(row.videoId);
                  if (!context.mounted) return;
                  await ShareHelper.shareText(
                    context,
                    text: '${p.displayTitle}\n$url\n— VideoSearch',
                    subject: p.displayTitle,
                  );
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context)
                        .showSnackBar(SnackBar(content: Text('$e')));
                  }
                }
              },
            ),
            IconButton(
              tooltip: 'Open in YouTube app',
              icon: const Icon(Icons.open_in_new_rounded),
              onPressed: () => _open(AppConfig.ytWatch(row.videoId)),
            ),
          ],
        ),
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            VaultYoutubePlayer(controller: player),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (p.channelTitle.isNotEmpty)
                    Text(
                      p.channelTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                        color: cs.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  const SizedBox(height: 2),
                  Text(
                    '${activityLabel(row)} · ${p.markCount} marks · ${p.shotCount} shots'
                    '${sources.isNotEmpty ? ' · ${sources.length} sources' : ''}'
                    '${p.hasBio ? ' · bio' : ''}',
                    style: TextStyle(
                      color: cs.onSurface.withValues(alpha: 0.45),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: () => player.playVideo(),
                        icon: const Icon(Icons.play_arrow_rounded, size: 18),
                        label: const Text('Play'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => app.toggleWatchLater(row.videoId),
                        icon: Icon(
                          p.watchLater
                              ? Icons.schedule
                              : Icons.schedule_outlined,
                          size: 18,
                        ),
                        label: Text(p.watchLater ? 'In later' : 'Later'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => app.toggleSave(row.videoId),
                        icon: Icon(
                          p.saved ? Icons.bookmark : Icons.bookmark_border,
                          size: 18,
                        ),
                        label: Text(p.saved ? 'Saved' : 'Save'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => _playlistSheet(context, app, row),
                        icon: const Icon(Icons.playlist_add_rounded, size: 18),
                        label: Text(
                          p.playlists.isEmpty
                              ? 'Playlist'
                              : '${p.playlists.length} lists',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (p.playlists.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final name in p.playlists)
                      InputChip(
                        visualDensity: VisualDensity.compact,
                        label: Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        onPressed: () => context.push(
                          Uri(
                            path: '/playlist',
                            queryParameters: {'name': name},
                          ).toString(),
                        ),
                      ),
                  ],
                ),
              ),
            TabBar(
              controller: tabs,
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              tabs: [
                Tab(text: 'Marks (${p.markCount})'),
                Tab(text: 'Shots (${p.shotCount})'),
                Tab(text: p.hasBio ? 'Bio •' : 'Bio'),
                Tab(text: 'Sources (${sources.length})'),
              ],
            ),
            Expanded(
              child: TabBarView(
          controller: tabs,
          children: [
            // Marks — jump to YouTube timestamp
            p.highlights.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.bookmark_add_outlined,
                              size: 40,
                              color: cs.primary.withValues(alpha: 0.6)),
                          const SizedBox(height: 10),
                          const Text('No marks on this video',
                              style: TextStyle(fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          Text(
                            'Mark moments on YouTube with the extension — they appear here.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: cs.onSurface.withValues(alpha: 0.5),
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextButton(
                            onPressed: () => context.go('/marks'),
                            child: const Text('Browse all marks'),
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: p.highlights.length,
                    itemBuilder: (context, i) {
                      final h = [...p.highlights]
                        ..sort((a, b) => a.startTime.compareTo(b.startTime));
                      final m = h[i];
                      final hasNote = m.note.trim().isNotEmpty;
                      final focused = focusMarkId != null &&
                          focusMarkId == m.id;
                      return GlassCard(
                        margin: const EdgeInsets.only(bottom: 10),
                        highlight: focused,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: cs.primary.withValues(alpha: 0.14),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    formatTime(m.startTime),
                                    style: TextStyle(
                                      color: cs.primary,
                                      fontWeight: FontWeight.w800,
                                      fontFeatures: const [
                                        FontFeature.tabularFigures()
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    hasNote ? m.note.trim() : 'Mark (no text)',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontStyle: hasNote
                                          ? FontStyle.normal
                                          : FontStyle.italic,
                                      color: hasNote
                                          ? null
                                          : cs.onSurface.withValues(alpha: 0.45),
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Delete',
                                  icon: Icon(Icons.delete_outline,
                                      color: cs.error),
                                  onPressed: () async {
                                    await app.deleteMark(row.videoId, m.id);
                                  },
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed: () => _playAt(m.startTime),
                                icon: const Icon(
                                  Icons.play_circle_fill_rounded,
                                  size: 18,
                                ),
                                label: Text(
                                  'Play here · ${formatTime(m.startTime)}',
                                ),
                              ),
                            ),
                          ],
                        ),
                      ).animate().fadeIn(delay: (30 * i).ms);
                    },
                  ),
            // Shots — full image grid, jump to time
            p.screenshots.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.camera_alt_outlined,
                              size: 40,
                              color: cs.primary.withValues(alpha: 0.6)),
                          const SizedBox(height: 10),
                          const Text('No shots on this video',
                              style: TextStyle(fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          Text(
                            'Capture frames with Shot on YouTube — they sync here.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: cs.onSurface.withValues(alpha: 0.5),
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextButton(
                            onPressed: () => context.go('/shots'),
                            child: const Text('Browse all shots'),
                          ),
                        ],
                      ),
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 0.8,
                    ),
                    itemCount: p.screenshots.length,
                    itemBuilder: (context, i) {
                      final s = p.screenshots[i];
                      final img = app.shotImageUrl(
                        ShotItem(
                          shot: s,
                          videoId: row.videoId,
                          title: p.displayTitle,
                          videoUrl: p.videoUrl,
                          channelTitle: p.channelTitle,
                        ),
                      );
                      return GlassCard(
                        padding: EdgeInsets.zero,
                        onTap: () => _showShot(
                          context,
                          app,
                          row,
                          s,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: ClipRRect(
                                borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(18),
                                ),
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    ShotImage(
                                      url: img,
                                      fit: BoxFit.cover,
                                      memCacheWidth: 480,
                                    ),
                                    Positioned(
                                      left: 8,
                                      bottom: 8,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.black
                                              .withValues(alpha: 0.65),
                                          borderRadius:
                                              BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          formatTime(s.videoTime),
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w800,
                                            fontSize: 11,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(8),
                              child: Text(
                                s.note.isEmpty
                                    ? 'Tap to view shot'
                                    : s.note,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
            // Bio — same content as Studio (markdown links stay tappable)
            ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Description / bio',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          if (p.bioSyncedAt != null)
                            Text(
                              'Synced ${relTime(p.bioSyncedAt)}',
                              style: TextStyle(
                                fontSize: 12,
                                color: cs.onSurface.withValues(alpha: 0.5),
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (editingBio)
                      TextButton(
                        onPressed: () {
                          bioCtrl.text = bio;
                          setState(() => editingBio = false);
                        },
                        child: const Text('Cancel'),
                      ),
                    TextButton.icon(
                      onPressed: () async {
                        if (editingBio) {
                          try {
                            await app.saveBio(row.videoId, bioCtrl.text);
                            if (!context.mounted) return;
                            setState(() => editingBio = false);
                          } catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('$e')),
                              );
                            }
                          }
                        } else {
                          bioCtrl.text = bio;
                          setState(() => editingBio = true);
                        }
                      },
                      icon: Icon(editingBio ? Icons.save : Icons.edit, size: 16),
                      label: Text(editingBio ? 'Save' : 'Edit'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (editingBio)
                  TextField(
                    controller: bioCtrl,
                    maxLines: 16,
                    decoration: const InputDecoration(
                      hintText:
                          'Full description… keep links as [label](https://…)',
                    ),
                  )
                else if (!p.hasBio)
                  Text(
                    'No bio yet. On YouTube, expand the description and tap Sync bio — the full text and links appear here.',
                    style: TextStyle(
                      color: cs.onSurface.withValues(alpha: 0.5),
                      height: 1.4,
                    ),
                  )
                else
                  GlassCard(child: BioRichText(text: bio)),
                if (p.playlists.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(
                    'Playlists',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final name in p.playlists)
                        ActionChip(
                          label: Text(name, overflow: TextOverflow.ellipsis),
                          avatar: const Icon(Icons.playlist_play_rounded,
                              size: 16),
                          onPressed: () => context.push(
                            Uri(
                              path: '/playlist',
                              queryParameters: {'name': name},
                            ).toString(),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
            // Sources
            sources.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        'No resource links yet.\nOnly Drive / PPT / docs / PDFs appear here.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: sources.length,
                    itemBuilder: (context, i) {
                      final l = sources[i];
                      return GlassCard(
                        margin: const EdgeInsets.only(bottom: 10),
                        onTap: () => _open(l.url),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: cs.primary.withValues(alpha: 0.14),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                kindLabel(l.kind),
                                style: TextStyle(
                                  color: cs.primary,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 11,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    l.label.isEmpty ? kindLabel(l.kind) : l.label,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Text(
                                    Uri.tryParse(l.url)?.host ?? l.url,
                                    style: TextStyle(
                                      fontSize: 12,
                                      color:
                                          cs.onSurface.withValues(alpha: 0.5),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(Icons.open_in_new, size: 16),
                          ],
                        ),
                      );
                    },
                  ),
              ],
            ),
          ),
        ],
        ),
      ),
    );
  }
}

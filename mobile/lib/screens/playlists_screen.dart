import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../core/config.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/glass.dart';
import '../widgets/video_tile.dart';

class PlaylistsScreen extends StatelessWidget {
  const PlaylistsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final lists = app.playlists;
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Playlists')),
      body: lists.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  'No playlists yet.\nOpen a video and tap Playlist to create one.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: cs.onSurface.withValues(alpha: 0.5),
                    height: 1.4,
                  ),
                ),
              ),
            )
          : GridView.builder(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.82,
              ),
              itemCount: lists.length,
              itemBuilder: (context, i) {
                final g = lists[i];
                final thumbs = g.rows.take(4).map((r) => r.videoId).toList();
                while (thumbs.length > 1 && thumbs.length < 4) {
                  thumbs.add(thumbs.last);
                }
                return GlassCard(
                  padding: EdgeInsets.zero,
                  onTap: () => context.push(
                    Uri(
                      path: '/playlist',
                      queryParameters: {'name': g.name},
                    ).toString(),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(18),
                          ),
                          child: thumbs.isEmpty
                              ? Container(
                                  color: Colors.black26,
                                  child: const Icon(Icons.playlist_play),
                                )
                              : thumbs.length == 1
                                  ? CachedNetworkImage(
                                      imageUrl: AppConfig.ytThumb(thumbs[0]),
                                      fit: BoxFit.cover,
                                    )
                                  : GridView.count(
                                      crossAxisCount: 2,
                                      physics:
                                          const NeverScrollableScrollPhysics(),
                                      children: thumbs
                                          .map(
                                            (id) => CachedNetworkImage(
                                              imageUrl: AppConfig.ytThumb(id),
                                              fit: BoxFit.cover,
                                            ),
                                          )
                                          .toList(),
                                    ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              g.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${g.rows.length} video${g.rows.length == 1 ? '' : 's'}',
                              style: TextStyle(
                                fontSize: 12,
                                color: cs.onSurface.withValues(alpha: 0.5),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                )
                    .animate()
                    .fadeIn(delay: (40 * i).ms)
                    .scale(
                      begin: const Offset(0.96, 0.96),
                      end: const Offset(1, 1),
                    );
              },
            ),
    );
  }
}

class PlaylistDetailScreen extends StatelessWidget {
  final String name;
  const PlaylistDetailScreen({super.key, required this.name});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final decoded = name.trim().isEmpty ? '' : name;
    PlaylistGroup? group;
    for (final g in app.playlists) {
      if (g.name.toLowerCase() == decoded.toLowerCase()) {
        group = g;
        break;
      }
    }
    final rows = group?.rows ?? [];
    final lead = rows.isNotEmpty ? rows.first : null;

    return Scaffold(
      appBar: AppBar(title: Text(decoded)),
      body: group == null
          ? const Center(child: Text('Playlist not found'))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                if (lead != null)
                  GlassCard(
                    padding: EdgeInsets.zero,
                    onTap: () => context.push('/video/${lead.videoId}'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ClipRRect(
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(18),
                          ),
                          child: AspectRatio(
                            aspectRatio: 16 / 9,
                            child: CachedNetworkImage(
                              imageUrl: AppConfig.ytThumb(lead.videoId),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'LATEST · 1 OF ${rows.length}',
                                style: TextStyle(
                                  color: Theme.of(context).colorScheme.primary,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.8,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                lead.payload.displayTitle,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                ),
                              ),
                              Text(
                                '${rows.length} videos in playlist',
                                style: TextStyle(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurface
                                      .withValues(alpha: 0.5),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 16),
                Text(
                  'All videos',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  'Latest on top · oldest at the bottom',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.42),
                  ),
                ),
                const SizedBox(height: 10),
                ...rows.asMap().entries.map((e) {
                  final i = e.key;
                  final r = e.value;
                  return VideoListRow(
                    row: r,
                    number: i + 1,
                    animIndex: i,
                    onTap: () => context.push('/video/${r.videoId}'),
                    onDelete: () async {
                      try {
                        await app.removeFromPlaylist(r.videoId, decoded);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Removed from “$decoded”'),
                            ),
                          );
                        }
                      } catch (err) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('$err')),
                          );
                        }
                      }
                    },
                  );
                }),
              ],
            ),
    );
  }
}

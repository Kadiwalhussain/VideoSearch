import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../services/share_helper.dart';
import '../widgets/glass.dart';
import '../widgets/video_tile.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final stats = app.stats;
    final name = app.session?.user.label.split(' ').first ?? 'there';
    final cs = Theme.of(context).colorScheme;

    return RefreshIndicator(
      onRefresh: () => app.refreshVault(force: true),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverAppBar(
            floating: true,
            title: const Text('Studio'),
            actions: [
              IconButton(
                tooltip: 'Refresh',
                onPressed: app.loading
                    ? null
                    : () => app.refreshVault(force: true),
                icon: app.loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh_rounded),
              ),
              const SizedBox(width: 4),
            ],
          ),
          if (app.error != null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: GlassCard(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Icon(Icons.wifi_off, color: cs.error),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          app.error!,
                          style: TextStyle(color: cs.error, fontSize: 13),
                        ),
                      ),
                      TextButton(
                        onPressed: () => app.refreshVault(force: true),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          // Hero
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: GlassCard(
                highlight: true,
                padding: const EdgeInsets.all(20),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: Theme.of(context).brightness == Brightness.dark
                      ? const [
                          Color(0xFF152033),
                          Color(0xFF0E1626),
                          Color(0xFF101C18),
                        ]
                      : const [
                          Color(0xFFFFFFFF),
                          Color(0xFFF0FDF6),
                          Color(0xFFF0F9FF),
                        ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: cs.primary.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                              color: cs.primary.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: cs.primary,
                                  boxShadow: [
                                    BoxShadow(
                                      color: cs.primary.withValues(alpha: 0.6),
                                      blurRadius: 6,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'LIVE VAULT',
                                style: TextStyle(
                                  color: cs.primary,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1.0,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Hey, $name',
                      style: Theme.of(context)
                          .textTheme
                          .headlineMedium
                          ?.copyWith(
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.6,
                          ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Marks & shots from YouTube — all in one place.',
                      style: TextStyle(
                        color: cs.onSurface.withValues(alpha: 0.52),
                        height: 1.4,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Column(
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: StatPill(
                                label: 'Videos',
                                value: '${stats.videos}',
                                icon: Icons.video_library_rounded,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: StatPill(
                                label: 'Marks',
                                value: '${stats.marks}',
                                icon: Icons.bookmark_rounded,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: StatPill(
                                label: 'Shots',
                                value: '${stats.shots}',
                                icon: Icons.camera_alt_rounded,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: StatPill(
                                label: 'Later',
                                value: '${stats.watchLater}',
                                icon: Icons.schedule_rounded,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.03, end: 0),
            ),
          ),
          // Quick access to Marks + Shots (core product)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: GlassCard(
                      onTap: () => context.go('/marks'),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: cs.primary.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(Icons.bookmark_rounded,
                                color: cs.primary),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${stats.marks}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 20,
                                  ),
                                ),
                                Text(
                                  'Marks',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: cs.onSurface.withValues(alpha: 0.55),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.chevron_right,
                              color: cs.onSurface.withValues(alpha: 0.35)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: GlassCard(
                      onTap: () => context.go('/shots'),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: cs.primary.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(Icons.camera_alt_rounded,
                                color: cs.primary),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${stats.shots}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 20,
                                  ),
                                ),
                                Text(
                                  'Shots',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: cs.onSurface.withValues(alpha: 0.55),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.chevron_right,
                              color: cs.onSurface.withValues(alpha: 0.35)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Row(
                children: [
                  Text(
                    'Recently synced',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => context.go('/library'),
                    child: const Text('View all'),
                  ),
                ],
              ),
            ),
          ),
          if (app.recent.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.inbox_outlined,
                          size: 48, color: cs.onSurface.withValues(alpha: 0.35)),
                      const SizedBox(height: 12),
                      const Text(
                        'Vault is empty',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Mark moments on YouTube with the extension while signed in.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: cs.onSurface.withValues(alpha: 0.5),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
              sliver: SliverList.builder(
                itemCount: app.recent.length,
                itemBuilder: (context, i) {
                  final r = app.recent[i];
                  return VideoListRow(
                    row: r,
                    number: i + 1,
                    animIndex: i,
                    onTap: () => context.push('/video/${r.videoId}'),
                    onShare: () async {
                      try {
                        final url = await app.shareVideo(r.videoId);
                        if (!context.mounted) return;
                        await ShareHelper.shareText(
                          context,
                          text:
                              '${r.payload.displayTitle}\n$url\n— VideoSearch',
                          subject: r.payload.displayTitle,
                        );
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('$e')),
                          );
                        }
                      }
                    },
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

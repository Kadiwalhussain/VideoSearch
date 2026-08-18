import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/glass.dart';

class SearchScreen extends StatefulWidget {
  final String? initialQuery;
  const SearchScreen({super.key, this.initialQuery});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final ctrl = TextEditingController();
  bool ai = true;
  bool busy = false;
  String aiAnswer = '';
  List<SearchHit> hits = [];
  String? err;

  @override
  void initState() {
    super.initState();
    ctrl.text = widget.initialQuery ?? '';
    if (ctrl.text.trim().isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _run());
    }
  }

  @override
  void dispose() {
    ctrl.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    final app = context.read<AppState>();
    final q = ctrl.text.trim();
    if (q.isEmpty) return;
    setState(() {
      busy = true;
      err = null;
      aiAnswer = '';
      hits = app.search(q);
    });
    if (ai && app.session != null) {
      try {
        final data = await app.api.aiSearch(app.session!, q);
        setState(() {
          aiAnswer = data['answer']?.toString() ?? '';
        });
      } catch (e) {
        setState(() => err = e.toString());
      }
    }
    setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('AI Search')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: GlassCard(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
              child: Row(
                children: [
                  const SizedBox(width: 8),
                  Icon(Icons.search, color: cs.onSurface.withValues(alpha: 0.5)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: ctrl,
                      decoration: const InputDecoration(
                        hintText: 'Ask about notes, channels, bio…',
                        border: InputBorder.none,
                        filled: false,
                      ),
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _run(),
                    ),
                  ),
                  IconButton(
                    onPressed: busy ? null : _run,
                    icon: busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(Icons.auto_awesome, color: cs.primary),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                ChoiceChip(
                  label: const Text('AI'),
                  selected: ai,
                  onSelected: (v) => setState(() => ai = true),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Keyword'),
                  selected: !ai,
                  onSelected: (v) => setState(() => ai = false),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                if (err != null)
                  Text(err!, style: TextStyle(color: cs.error)),
                if (aiAnswer.isNotEmpty) ...[
                  GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.auto_awesome, size: 16, color: cs.primary),
                            const SizedBox(width: 6),
                            Text(
                              'AI answer',
                              style: TextStyle(
                                color: cs.primary,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(aiAnswer, style: const TextStyle(height: 1.4)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                Text(
                  'Matches',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                if (hits.isEmpty)
                  Text(
                    'No matches yet — try searching a note or title.',
                    style: TextStyle(
                      color: cs.onSurface.withValues(alpha: 0.5),
                    ),
                  )
                else
                  ...hits.map((h) {
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        h.kind == 'mark'
                            ? Icons.bookmark_border
                            : h.kind == 'shot'
                                ? Icons.camera_alt_outlined
                                : Icons.play_circle_outline,
                        color: cs.primary,
                      ),
                      title: Text(
                        h.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        h.time != null
                            ? '${formatTime(h.time!)} · ${h.snippet}'
                            : h.snippet,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      onTap: () => context.push(
                        videoLocation(
                          h.videoId,
                          tab: h.kind == 'shot'
                              ? 'shots'
                              : h.kind == 'mark'
                                  ? 'marks'
                                  : 'marks',
                          t: h.time,
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

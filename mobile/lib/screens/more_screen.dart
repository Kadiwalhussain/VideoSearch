import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../core/config.dart';
import '../core/validators.dart';
import '../providers/app_state.dart';
import '../widgets/glass.dart';

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  final apiCtrl = TextEditingController();
  bool? healthy;

  @override
  void initState() {
    super.initState();
    final app = context.read<AppState>();
    apiCtrl.text = app.apiBase;
  }

  @override
  void dispose() {
    apiCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final user = app.session?.user;
    final cs = Theme.of(context).colorScheme;
    final stats = app.stats;

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          GlassCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: cs.primary.withValues(alpha: 0.18),
                  child: Text(
                    (user?.label.isNotEmpty == true
                            ? user!.label[0]
                            : '?')
                        .toUpperCase(),
                    style: TextStyle(
                      color: cs.primary,
                      fontWeight: FontWeight.w900,
                      fontSize: 22,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.label ?? 'Account',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                        ),
                      ),
                      Text(
                        user?.email ?? '',
                        style: TextStyle(
                          color: cs.onSurface.withValues(alpha: 0.55),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Explore',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          GlassCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.auto_awesome),
                  title: const Text('AI Search'),
                  subtitle: const Text('Search notes, shots, bio'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/search'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.playlist_play_rounded),
                  title: const Text('Playlists'),
                  subtitle: Text('${app.playlists.length} lists'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/playlists'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.bookmark_rounded),
                  title: const Text('All marks'),
                  subtitle: Text('${stats.marks} timestamps'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.go('/marks'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.camera_alt_rounded),
                  title: const Text('All shots'),
                  subtitle: Text('${stats.shots} captures'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.go('/shots'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Vault',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          GlassCard(
            child: Column(
              children: [
                _row(Icons.video_library_outlined, 'Videos', '${stats.videos}'),
                _row(Icons.bookmark_border, 'Marks', '${stats.marks}'),
                _row(Icons.camera_alt_outlined, 'Shots', '${stats.shots}'),
                _row(Icons.notes_outlined, 'Notes', '${stats.notes}'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Server',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: apiCtrl,
                  validator: Validators.apiBase,
                  autovalidateMode: AutovalidateMode.onUserInteraction,
                  decoration: const InputDecoration(
                    labelText: 'Vault API URL',
                    helperText:
                        'Physical phone: Mac/PC LAN IP:8787\nAndroid emulator: http://10.0.2.2:8787',
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () async {
                          final err = Validators.apiBase(apiCtrl.text);
                          if (err != null) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(err)),
                            );
                            return;
                          }
                          await app.setApiBase(apiCtrl.text);
                          try {
                            await app.api.pingHealth(app.apiBase);
                            setState(() => healthy = true);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    'Vault reachable ✓ ${app.apiBase}',
                                  ),
                                ),
                              );
                            }
                          } catch (e) {
                            setState(() => healthy = false);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(e.toString()),
                                  duration: const Duration(seconds: 6),
                                ),
                              );
                            }
                          }
                        },
                        child: Text(
                          healthy == null
                              ? 'Test connection'
                              : healthy!
                                  ? 'Healthy ✓'
                                  : 'Unreachable',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton(
                        onPressed: () async {
                          final err = Validators.apiBase(apiCtrl.text);
                          if (err != null) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(err)),
                            );
                            return;
                          }
                          await app.setApiBase(apiCtrl.text);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Saved API URL')),
                            );
                          }
                        },
                        child: const Text('Save'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Default for this device: ${AppConfig.defaultApiBase}',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: cs.onSurface.withValues(alpha: 0.45),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Appearance',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          GlassCard(
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Dark mode'),
              subtitle: const Text('Matches Studio day / night'),
              value: app.dark,
              onChanged: (v) => app.setDark(v),
            ),
          ),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (c) => AlertDialog(
                  title: const Text('Log out?'),
                  content: const Text(
                    'You’ll need to sign in again to access your vault.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('Log out'),
                    ),
                  ],
                ),
              );
              if (ok == true) await app.logout();
            },
            icon: const Icon(Icons.logout),
            label: const Text('Log out'),
          ),
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

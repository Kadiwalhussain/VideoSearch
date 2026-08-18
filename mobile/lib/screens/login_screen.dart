import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../core/config.dart';
import '../core/theme.dart';
import '../core/validators.dart';
import '../providers/app_state.dart';
import '../widgets/glass.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final formKey = GlobalKey<FormState>();
  final email = TextEditingController();
  final password = TextEditingController();
  final name = TextEditingController();
  final apiCtrl = TextEditingController();
  bool register = false;
  bool obscure = true;
  /// Always open on physical phones so users set LAN IP.
  late bool advanced = AppConfig.isPhysicalMobile;
  String? localError;
  String? healthOk;
  bool testing = false;

  @override
  void initState() {
    super.initState();
    final app = context.read<AppState>();
    final base =
        app.apiBase.isEmpty ? AppConfig.defaultApiBase : app.apiBase;
    apiCtrl.text = base;
    // Physical phone + loopback → force user to edit URL
    if (AppConfig.isPhysicalMobile && AppConfig.isLoopbackBase(base)) {
      advanced = true;
    }
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
    apiCtrl.dispose();
    super.dispose();
  }

  Future<void> _testConnection() async {
    setState(() {
      testing = true;
      localError = null;
      healthOk = null;
    });
    final app = context.read<AppState>();
    try {
      final base = AppConfig.normalizeBase(apiCtrl.text);
      await app.setApiBase(base);
      final data = await app.api.pingHealth(base);
      final mongo = data['mongo']?.toString() ?? '?';
      setState(() {
        healthOk =
            'Connected · mongo: $mongo · ${AppConfig.normalizeBase(base)}';
      });
    } catch (e) {
      setState(() => localError = e.toString());
    } finally {
      if (mounted) setState(() => testing = false);
    }
  }

  Future<void> _submit() async {
    setState(() {
      localError = null;
      healthOk = null;
    });
    if (!(formKey.currentState?.validate() ?? false)) return;

    final base = AppConfig.normalizeBase(apiCtrl.text);
    if (AppConfig.isPhysicalMobile && AppConfig.isLoopbackBase(base)) {
      setState(() {
        advanced = true;
        localError =
            'On your iPhone, set Vault URL to your Mac’s Wi‑Fi IP, e.g. '
            'http://192.168.0.103:8787 — not 127.0.0.1.\n'
            'On Mac Terminal: ipconfig getifaddr en0';
      });
      return;
    }

    final app = context.read<AppState>();
    try {
      await app.setApiBase(base);
      if (register) {
        await app.register(email.text, password.text, name.text);
      } else {
        await app.login(email.text, password.text);
      }
    } catch (e) {
      setState(() {
        advanced = true;
        localError = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final cs = Theme.of(context).colorScheme;
    final loopback = AppConfig.isLoopbackBase(apiCtrl.text);

    return Scaffold(
      body: Stack(
        children: [
          Positioned(
            top: -80,
            right: -40,
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    VSTheme.accent.withValues(alpha: 0.28),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 80,
            left: -60,
            child: Container(
              width: 200,
              height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF38BDF8).withValues(alpha: 0.18),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(22),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(16),
                              gradient: const LinearGradient(
                                colors: [
                                  Color(0xFF34D399),
                                  Color(0xFF10B981)
                                ],
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color:
                                      VSTheme.accent.withValues(alpha: 0.35),
                                  blurRadius: 18,
                                ),
                              ],
                            ),
                            child: const Icon(Icons.play_circle_fill_rounded,
                                color: Color(0xFF04140C), size: 30),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'VideoSearch',
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineMedium
                                    ?.copyWith(fontWeight: FontWeight.w900),
                              ),
                              Text(
                                'Mobile Studio',
                                style: TextStyle(
                                  color: cs.onSurface.withValues(alpha: 0.55),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ],
                      )
                          .animate()
                          .fadeIn(duration: 400.ms)
                          .slideX(begin: -0.05, end: 0),
                      const SizedBox(height: 28),
                      GlassCard(
                        padding: const EdgeInsets.all(20),
                        child: Form(
                          key: formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                register ? 'Create account' : 'Welcome back',
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Same account as Chrome + Studio.',
                                style: TextStyle(
                                  color: cs.onSurface.withValues(alpha: 0.55),
                                  height: 1.35,
                                ),
                              ),
                              if (AppConfig.isPhysicalMobile) ...[
                                const SizedBox(height: 12),
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0x28FBBF24),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: const Color(0x66FBBF24),
                                    ),
                                  ),
                                  child: const Text(
                                    'Phone must use your Mac’s Wi‑Fi IP, not 127.0.0.1.\n'
                                    'Example: http://192.168.0.103:8787\n'
                                    'Mac: ipconfig getifaddr en0 · same Wi‑Fi · vault running',
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      height: 1.35,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 20),
                              if (register) ...[
                                TextFormField(
                                  controller: name,
                                  textInputAction: TextInputAction.next,
                                  validator: Validators.displayName,
                                  decoration: const InputDecoration(
                                    labelText: 'Display name',
                                    prefixIcon: Icon(Icons.person_outline),
                                  ),
                                ),
                                const SizedBox(height: 12),
                              ],
                              TextFormField(
                                controller: email,
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.next,
                                autocorrect: false,
                                enableSuggestions: false,
                                validator: Validators.email,
                                decoration: const InputDecoration(
                                  labelText: 'Email',
                                  prefixIcon: Icon(Icons.mail_outline),
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: password,
                                obscureText: obscure,
                                onFieldSubmitted: (_) => _submit(),
                                validator: (v) => Validators.password(
                                  v,
                                  forRegister: register,
                                ),
                                decoration: InputDecoration(
                                  labelText: 'Password',
                                  prefixIcon: const Icon(Icons.lock_outline),
                                  suffixIcon: IconButton(
                                    onPressed: () =>
                                        setState(() => obscure = !obscure),
                                    icon: Icon(obscure
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              TextButton(
                                onPressed: () =>
                                    setState(() => advanced = !advanced),
                                child: Text(
                                  advanced
                                      ? 'Hide vault URL'
                                      : 'Vault server URL (required on phone)',
                                  style: TextStyle(
                                    color: cs.primary,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              if (advanced) ...[
                                TextFormField(
                                  controller: apiCtrl,
                                  keyboardType: TextInputType.url,
                                  autocorrect: false,
                                  onChanged: (_) => setState(() {}),
                                  validator: Validators.apiBase,
                                  decoration: InputDecoration(
                                    labelText: 'API base',
                                    hintText: 'http://192.168.0.103:8787',
                                    prefixIcon:
                                        const Icon(Icons.dns_outlined),
                                    suffixIcon: IconButton(
                                      tooltip: 'Paste',
                                      onPressed: () async {
                                        final data = await Clipboard
                                            .getData(Clipboard.kTextPlain);
                                        final t = data?.text?.trim();
                                        if (t != null && t.isNotEmpty) {
                                          setState(() => apiCtrl.text = t);
                                        }
                                      },
                                      icon: const Icon(Icons.paste_outlined),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                OutlinedButton.icon(
                                  onPressed:
                                      testing || app.loading
                                          ? null
                                          : _testConnection,
                                  icon: testing
                                      ? const SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : Icon(
                                          loopback
                                              ? Icons.warning_amber_rounded
                                              : Icons.wifi_tethering,
                                        ),
                                  label: Text(
                                    testing
                                        ? 'Testing…'
                                        : 'Test connection',
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  AppConfig.phoneConnectionHint(apiCtrl.text),
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    height: 1.35,
                                    color:
                                        cs.onSurface.withValues(alpha: 0.55),
                                  ),
                                ),
                              ],
                              if (healthOk != null) ...[
                                const SizedBox(height: 12),
                                Text(
                                  healthOk!,
                                  style: TextStyle(
                                    color: cs.primary,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                              if (localError != null) ...[
                                const SizedBox(height: 12),
                                Text(
                                  localError!,
                                  style: TextStyle(
                                    color: cs.error,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13,
                                    height: 1.35,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: app.loading ? null : _submit,
                                child: app.loading
                                    ? const SizedBox(
                                        height: 20,
                                        width: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.2,
                                          color: Color(0xFF04140C),
                                        ),
                                      )
                                    : Text(register
                                        ? 'Create account'
                                        : 'Sign in'),
                              ),
                              const SizedBox(height: 10),
                              TextButton(
                                onPressed: () =>
                                    setState(() => register = !register),
                                child: Text(
                                  register
                                      ? 'Already have an account? Sign in'
                                      : 'New here? Create account',
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                          .animate()
                          .fadeIn(delay: 100.ms)
                          .slideY(begin: 0.04, end: 0),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

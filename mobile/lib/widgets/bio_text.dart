import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/theme.dart';

/// Renders vault bio / description with clickable `[label](url)` links.
class BioRichText extends StatefulWidget {
  final String text;
  final TextStyle? style;

  const BioRichText({super.key, required this.text, this.style});

  @override
  State<BioRichText> createState() => _BioRichTextState();
}

class _BioRichTextState extends State<BioRichText> {
  final _taps = <TapGestureRecognizer>[];

  @override
  void dispose() {
    for (final t in _taps) {
      t.dispose();
    }
    super.dispose();
  }

  Future<void> _open(String url) async {
    final u = Uri.tryParse(url);
    if (u == null) return;
    await launchUrl(u, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    for (final t in _taps) {
      t.dispose();
    }
    _taps.clear();

    final base = widget.style ??
        TextStyle(
          height: 1.5,
          fontSize: 14,
          color: Theme.of(context).colorScheme.onSurface,
        );
    final linkStyle = base.copyWith(
      color: VSTheme.accentDeep,
      fontWeight: FontWeight.w700,
      decoration: TextDecoration.underline,
      decorationColor: VSTheme.accent.withValues(alpha: 0.5),
    );

    final re = RegExp(r'\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)');
    final spans = <InlineSpan>[];
    var i = 0;
    for (final m in re.allMatches(widget.text)) {
      if (m.start > i) {
        spans.add(TextSpan(text: widget.text.substring(i, m.start)));
      }
      final label = m.group(1) ?? '';
      final url = m.group(2) ?? '';
      final tap = TapGestureRecognizer()..onTap = () => _open(url);
      _taps.add(tap);
      spans.add(TextSpan(text: label, style: linkStyle, recognizer: tap));
      i = m.end;
    }
    if (i < widget.text.length) {
      spans.add(TextSpan(text: widget.text.substring(i)));
    }
    if (spans.isEmpty) {
      spans.add(const TextSpan(text: ''));
    }

    return SelectableText.rich(TextSpan(style: base, children: spans));
  }
}

import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../core/theme.dart';

/// Robust shot / media image: network + auth proxy, or data:image base64.
class ShotImage extends StatelessWidget {
  final String url;
  final BoxFit fit;
  final double? width;
  final double? height;
  final int? memCacheWidth;
  final BorderRadius? borderRadius;
  final Widget? placeholder;
  final Widget? error;

  const ShotImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.memCacheWidth,
    this.borderRadius,
    this.placeholder,
    this.error,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final ph = placeholder ??
        Container(
          color: cs.surfaceContainerHighest.withValues(alpha: 0.55),
          alignment: Alignment.center,
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: VSTheme.accent.withValues(alpha: 0.7),
            ),
          ),
        );
    final err = error ??
        Container(
          color: cs.surfaceContainerHighest.withValues(alpha: 0.55),
          alignment: Alignment.center,
          child: Icon(
            Icons.image_not_supported_outlined,
            size: 22,
            color: cs.onSurface.withValues(alpha: 0.28),
          ),
        );

    Widget child;
    if (url.isEmpty) {
      child = err;
    } else if (url.startsWith('data:image')) {
      child = _DataImage(url: url, fit: fit, error: err);
    } else {
      final headers = <String, String>{'Accept': 'image/*'};
      final tok = Uri.tryParse(url)?.queryParameters['token'];
      if (tok != null && tok.isNotEmpty) {
        headers['Authorization'] = 'Bearer $tok';
      }
      child = CachedNetworkImage(
        imageUrl: url,
        fit: fit,
        width: width,
        height: height,
        memCacheWidth: memCacheWidth,
        fadeInDuration: const Duration(milliseconds: 180),
        httpHeaders: headers,
        placeholder: (context, url) => ph,
        errorWidget: (context, url, error) => err,
      );
    }

    if (borderRadius != null) {
      return ClipRRect(borderRadius: borderRadius!, child: child);
    }
    return child;
  }
}

class _DataImage extends StatelessWidget {
  final String url;
  final BoxFit fit;
  final Widget error;

  const _DataImage({
    required this.url,
    required this.fit,
    required this.error,
  });

  @override
  Widget build(BuildContext context) {
    try {
      final comma = url.indexOf(',');
      if (comma < 0) return error;
      final b64 = url.substring(comma + 1);
      final bytes = base64Decode(b64);
      return Image.memory(bytes, fit: fit, gaplessPlayback: true);
    } catch (_) {
      return error;
    }
  }
}

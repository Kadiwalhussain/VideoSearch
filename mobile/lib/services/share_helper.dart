import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

/// Safe system share wrapper.
/// Always supplies [sharePositionOrigin] (required on iPad / newer iOS).
class ShareHelper {
  static Future<ShareResult> shareText(
    BuildContext context, {
    required String text,
    String? subject,
  }) async {
    final box = context.findRenderObject() as RenderBox?;
    Rect? origin;
    if (box != null && box.hasSize) {
      origin = box.localToGlobal(Offset.zero) & box.size;
    } else {
      final size = MediaQuery.sizeOf(context);
      origin = Rect.fromCenter(
        center: Offset(size.width / 2, size.height / 2),
        width: 1,
        height: 1,
      );
    }

    return SharePlus.instance.share(
      ShareParams(
        text: text,
        subject: subject,
        sharePositionOrigin: origin,
      ),
    );
  }
}

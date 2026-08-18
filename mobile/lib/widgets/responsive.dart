import 'package:flutter/material.dart';

/// Breakpoints for tablet / desktop-friendly layouts.
class Breakpoints {
  static const phone = 600.0;
  static const tablet = 900.0;
  static const desktop = 1200.0;
}

class Responsive {
  static bool isPhone(BuildContext context) =>
      MediaQuery.sizeOf(context).width < Breakpoints.phone;

  static bool isTablet(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    return w >= Breakpoints.phone && w < Breakpoints.desktop;
  }

  static bool isWide(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= Breakpoints.tablet;

  static int gridColumns(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= Breakpoints.desktop) return 3;
    if (w >= Breakpoints.phone) return 2;
    return 1;
  }

  static double pagePadding(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= Breakpoints.desktop) return 28;
    if (w >= Breakpoints.phone) return 20;
    return 16;
  }

  static double contentMaxWidth(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= 1200) return 1100;
    return w;
  }
}

/// Centers content and caps width on large screens.
class ResponsiveBody extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;

  const ResponsiveBody({super.key, required this.child, this.padding});

  @override
  Widget build(BuildContext context) {
    final pad = padding ??
        EdgeInsets.symmetric(
          horizontal: Responsive.pagePadding(context),
          vertical: 8,
        );
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: Responsive.contentMaxWidth(context),
        ),
        child: Padding(padding: pad, child: child),
      ),
    );
  }
}

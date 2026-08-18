import 'package:flutter/material.dart';

/// Premium VideoSearch theme — deep slate + emerald glass.
/// Uses system fonts so the first frame never blocks on Google Fonts download
/// (common white-screen cause on physical devices with slow/offline network).
class VSTheme {
  static const accent = Color(0xFF34D399);
  static const accentDeep = Color(0xFF10B981);
  static const accentDim = Color(0x2834D399);
  static const danger = Color(0xFFFB7185);
  static const ink = Color(0xFF04140C);

  static const darkBg = Color(0xFF05080F);
  static const darkSurface = Color(0xFF0C1220);
  static const darkCard = Color(0xFF121A2B);
  static const darkBorder = Color(0x1AFFFFFF);

  static const lightBg = Color(0xFFF0F4F8);
  static const lightSurface = Color(0xFFFFFFFF);
  static const lightBorder = Color(0x12000000);

  static ThemeData dark() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      // Do not set fontFamily to ".SF Pro Text" — invalid for Flutter engine
      // and can leave text unpainted on physical iPhones.
      colorScheme: const ColorScheme.dark(
        primary: accent,
        onPrimary: ink,
        secondary: Color(0xFF38BDF8),
        surface: darkSurface,
        onSurface: Color(0xFFF1F5F9),
        error: danger,
        outline: darkBorder,
      ),
      scaffoldBackgroundColor: darkBg,
    );
    return _apply(base, dark: true);
  }

  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: const ColorScheme.light(
        primary: Color(0xFF059669),
        onPrimary: Colors.white,
        secondary: Color(0xFF0284C7),
        surface: lightSurface,
        onSurface: Color(0xFF0F172A),
        error: Color(0xFFE11D48),
        outline: lightBorder,
      ),
      scaffoldBackgroundColor: lightBg,
    );
    return _apply(base, dark: false);
  }

  static ThemeData _apply(ThemeData base, {required bool dark}) {
    final on = base.colorScheme.onSurface;
    final text = base.textTheme;

    return base.copyWith(
      textTheme: text.copyWith(
        headlineLarge: text.headlineLarge?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: -0.8,
        ),
        headlineMedium: text.headlineMedium?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: -0.6,
        ),
        titleLarge: text.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
        titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        backgroundColor: dark
            ? darkBg.withValues(alpha: 0.85)
            : lightBg.withValues(alpha: 0.9),
        surfaceTintColor: Colors.transparent,
        titleTextStyle: text.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          fontSize: 22,
          letterSpacing: -0.4,
          color: on,
        ),
        iconTheme: IconThemeData(color: on),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: dark ? darkCard : lightSurface,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(
            color: dark ? darkBorder : lightBorder,
            width: 1,
          ),
        ),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        side: BorderSide(color: dark ? darkBorder : lightBorder),
        labelStyle: text.labelMedium?.copyWith(fontWeight: FontWeight.w700),
        selectedColor: accent.withValues(alpha: 0.18),
        checkmarkColor: accent,
        padding: const EdgeInsets.symmetric(horizontal: 4),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? const Color(0xFF0A101C) : const Color(0xFFF8FAFC),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(
            color: dark ? darkBorder : lightBorder,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: accent, width: 1.4),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: ink,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.2,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: on,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          side: BorderSide(color: dark ? darkBorder : lightBorder),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 70,
        elevation: 0,
        backgroundColor:
            dark ? const Color(0xEE0A101C) : const Color(0xF2FFFFFF),
        surfaceTintColor: Colors.transparent,
        indicatorColor: accent.withValues(alpha: 0.16),
        indicatorShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith((s) {
          final onSel = s.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11,
            fontWeight: onSel ? FontWeight.w800 : FontWeight.w600,
            letterSpacing: -0.1,
            color: onSel ? accent : on.withValues(alpha: 0.45),
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((s) {
          final onSel = s.contains(WidgetState.selected);
          return IconThemeData(
            size: 22,
            color: onSel ? accent : on.withValues(alpha: 0.45),
          );
        }),
      ),
      dividerTheme: DividerThemeData(
        color: dark ? darkBorder : lightBorder,
        thickness: 1,
        space: 1,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: dark ? darkCard : const Color(0xFF0F172A),
        contentTextStyle: const TextStyle(
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: dark ? darkCard : lightSurface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
    );
  }
}

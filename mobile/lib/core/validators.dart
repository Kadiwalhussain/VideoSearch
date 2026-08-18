/// Input validation for auth and settings (client-side; server still enforces).
class Validators {
  static String? email(String? v) {
    final s = (v ?? '').trim().toLowerCase();
    if (s.isEmpty) return 'Email is required';
    if (!s.contains('@') || !RegExp(r'^[^@]+@[^@]+\.[^@]+$').hasMatch(s)) {
      return 'Enter a valid email address';
    }
    if (s.length > 200) return 'Email is too long';
    return null;
  }

  static String? password(String? v, {bool forRegister = false}) {
    final s = v ?? '';
    if (s.isEmpty) return 'Password is required';
    if (s.length < 6) return 'Password must be at least 6 characters';
    if (s.length > 128) return 'Password is too long';
    if (forRegister && s.trim() != s) {
      return 'Password cannot start or end with spaces';
    }
    return null;
  }

  static String? displayName(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return null; // optional
    if (s.length > 80) return 'Name is too long';
    return null;
  }

  static String? apiBase(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return 'Vault URL is required';
    final withScheme = s.startsWith('http://') || s.startsWith('https://')
        ? s
        : 'http://$s';
    final uri = Uri.tryParse(withScheme);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return 'Enter a valid URL (e.g. http://192.168.1.10:8787)';
    }
    if (uri.scheme != 'http' && uri.scheme != 'https') {
      return 'Only http or https URLs are allowed';
    }
    return null;
  }
}

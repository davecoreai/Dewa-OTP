import { json, error, readJson } from '../../../../lib/http';
import { createSupabaseServerClient } from '../../../../lib/supabase';
import { verifyRecaptcha } from '../../../../lib/security';

export async function POST(request) {
  const body = await readJson(request);
  const fullName = String(body?.name || '').trim();
  const username = String(body?.username || '').trim().toLowerCase();
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!fullName || !username || !email || password.length < 8) return error('Lengkapi semua kolom. Password minimal 8 karakter.');
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return error('Username harus 3–24 karakter, hanya huruf kecil, angka, dan underscore.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('Format email tidak valid.');

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const expectedHostname = new URL(request.url).hostname;
  const captcha = await verifyRecaptcha(body?.captchaToken, ip, expectedHostname);
  if (!captcha.ok) return error(captcha.reason, 403, 'CAPTCHA_FAILED');

  try {
    const supabase = await createSupabaseServerClient();
    const { data: available, error: usernameError } = await supabase.rpc('is_username_available', { p_username: username });
    if (usernameError) return error('Database belum siap. Jalankan sql/schema.sql terlebih dahulu.', 503, 'DATABASE_NOT_READY');
    if (!available) return error('Username sudah digunakan.');

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/auth/callback`,
        data: { full_name: fullName, username }
      }
    });
    if (signUpError) return error(signUpError.message, 400, 'REGISTER_FAILED');
    return json({ success: true, message: 'Pendaftaran berhasil. Periksa email untuk verifikasi akun.', user: data.user ? { id: data.user.id, email: data.user.email } : null });
  } catch (err) {
    return error(err.message || 'Gagal mendaftar.', 500);
  }
}

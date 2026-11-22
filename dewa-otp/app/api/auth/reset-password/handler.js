import { json, error, readJson } from '../../../../lib/http';
import { createSupabaseServerClient } from '../../../../lib/supabase';
export async function POST(request) {
  const body = await readJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  if (!email) return error('Masukkan email akun Anda.');
  try {
    const supabase = await createSupabaseServerClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/auth/callback?next=/reset-password`
    });
    if (resetError) return error(resetError.message, 400);
    return json({ success: true, message: 'Jika email terdaftar, instruksi pemulihan akan dikirim.' });
  } catch (err) { return error(err.message || 'Gagal meminta reset password.', 500); }
}

import { json, error, readJson } from '../../../../lib/http';
import { createSupabaseServerClient } from '../../../../lib/supabase';

export async function POST(request) {
  const body = await readJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!email || !password) return error('Email dan password wajib diisi.');
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) return error('Email atau password salah.', 401, 'INVALID_CREDENTIALS');
    return json({ success: true, user: { id: data.user.id, email: data.user.email } });
  } catch (err) { return error(err.message || 'Login gagal.', 500); }
}

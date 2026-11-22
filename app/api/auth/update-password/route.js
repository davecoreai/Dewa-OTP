import { json, error, readJson } from '../../../../lib/http';
import { createSupabaseServerClient } from '../../../../lib/supabase';
export async function POST(request) {
  const body = await readJson(request);
  const password = String(body?.password || '');
  if (password.length < 8) return error('Password minimal 8 karakter.');
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError || !data?.user) return error(updateError?.message || 'Sesi pemulihan tidak valid.', 400);
    return json({ success: true, message: 'Password berhasil diperbarui.' });
  } catch (err) { return error(err.message || 'Gagal memperbarui password.', 500); }
}

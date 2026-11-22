import { json, error, readJson } from '../../../lib/http';
import { requireUser } from '../../../lib/supabase';
export async function PATCH(request) {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const body = await readJson(request);
  const fullName = String(body?.name || '').trim();
  if (!fullName || fullName.length > 80) return error('Nama wajib diisi dan maksimal 80 karakter.');
  const { error: updateError } = await supabase.rpc('update_profile_name', { p_user_id: user.id, p_full_name: fullName });
  if (updateError) return error('Gagal memperbarui profil.', 500);
  return json({ success: true });
}

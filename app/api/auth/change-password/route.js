import { json, error, readJson } from '../../../../lib/http';
import { requireUser } from '../../../../lib/supabase';

export async function POST(request) {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const body = await readJson(request);
  const oldPassword = String(body?.oldPassword || '');
  const newPassword = String(body?.newPassword || '');
  if (!oldPassword || newPassword.length < 8) return error('Password lama wajib diisi dan password baru minimal 8 karakter.');
  if (oldPassword === newPassword) return error('Password baru harus berbeda dari password lama.');

  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
  if (verifyError) return error('Password lama tidak sesuai. Untuk akun Google tanpa password, gunakan reset password melalui email.', 401, 'OLD_PASSWORD_INVALID');

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) return error(updateError.message, 400, 'PASSWORD_UPDATE_FAILED');
  return json({ success: true, message: 'Password berhasil diperbarui.' });
}

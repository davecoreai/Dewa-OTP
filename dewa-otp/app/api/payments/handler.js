import { error } from '../../../lib/http';
import { requireUser } from '../../../lib/supabase';

// Sengaja fail-closed: format signature dan request QRIS harus disesuaikan dengan merchant DOKU yang disetujui.
export async function POST() {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  return error('Adapter pembayaran DOKU belum diaktifkan. Lengkapi kredensial merchant, format request QRIS, dan verifikasi webhook terlebih dahulu.', 503, 'DOKU_NOT_CONFIGURED');
}

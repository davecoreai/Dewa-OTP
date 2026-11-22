import { json, error } from '../../../../../lib/http';
import { requireUser } from '../../../../../lib/supabase';
import { resendOrder } from '../../../../../lib/nokosnesia';

export async function POST(_request, context) {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const { id } = await context.params;
  const { data: order } = await supabase.from('orders').select('provider_activation_id,status,otp_code').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!order) return error('Pesanan tidak ditemukan.', 404);
  if (order.status !== 'pending' || order.otp_code) return error('Kirim ulang hanya tersedia untuk pesanan aktif yang belum menerima OTP.', 409);
  try {
    const result = await resendOrder(order.provider_activation_id);
    return json({ success: true, message: result.message || 'Permintaan kirim ulang diterima.' });
  } catch (err) { return error(err.message || 'Nokosnesia tidak dapat mengirim ulang OTP.', err.status || 502); }
}

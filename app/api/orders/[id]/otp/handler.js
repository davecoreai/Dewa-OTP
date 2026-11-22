import { json, error } from '../../../../../lib/http';
import { requireUser, createSupabaseAdminClient } from '../../../../../lib/supabase';
import { getOrderStatus, nokosRequest } from '../../../../../lib/nokos';

export async function GET(_request, context) {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const admin = await createSupabaseAdminClient();
  const { id } = await context.params;
  const { data: order, error: orderError } = await supabase.from('orders').select('id, provider_activation_id, status, last_otp_check_at, otp_code').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (orderError || !order) return error('Pesanan tidak ditemukan.', 404);
  if (order.status === 'success') return json({ success: true, status: 'success', otp: order.otp_code });
  if (['refunded', 'cancelled', 'failed', 'expired'].includes(order.status)) return json({ success: true, status: order.status, otp: null });
  const last = order.last_otp_check_at ? new Date(order.last_otp_check_at).getTime() : 0;
  if (Date.now() - last < 2500) return error('Tunggu sebentar sebelum mengecek OTP lagi.', 429, 'RATE_LIMITED');
  const { data: allowed } = await admin.rpc('touch_order_otp_check', { p_user_id: user.id, p_order_id: id });
  if (!allowed) return error('Tunggu sebentar sebelum mengecek OTP lagi.', 429, 'RATE_LIMITED');
  try {
    const result = await getOrderStatus(order.provider_activation_id);
    const status = result?.data?.status || 'STATUS_WAIT_CODE';
    const otp = result?.data?.code ? String(result.data.code) : null;
    if (status === 'STATUS_OK' && otp) {
      await admin.rpc('complete_order_with_otp', { p_user_id: user.id, p_order_id: id, p_otp_code: otp });
      nokosRequest('setStatus', { method: 'POST', body: { id: order.provider_activation_id, status: 6 } }).catch(() => {});
      return json({ success: true, status: 'success', otp });
    }
    // Selain STATUS_OK, pertahankan status pending agar tombol Refund tetap tersedia.
    // Refund tetap harus dikonfirmasi melalui cancelActivation provider.
    return json({ success: true, status: 'pending', otp: null });
  } catch (err) { return error(err.message || 'Gagal mengecek OTP.', 502); }
}

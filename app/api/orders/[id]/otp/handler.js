import { json, error } from '../../../../../lib/http';
import { requireUser, createSupabaseAdminClient } from '../../../../../lib/supabase';
import { getOrderStatus, finishOrder } from '../../../../../lib/nokosnesia';

export async function GET(_request, context) {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const admin = await createSupabaseAdminClient();
  const { id } = await context.params;
  const { data: order, error: orderError } = await supabase.from('orders')
    .select('id,provider_activation_id,status,last_otp_check_at,otp_code')
    .eq('id', id).eq('user_id', user.id).maybeSingle();
  if (orderError || !order) return error('Pesanan tidak ditemukan.', 404);
  if (order.status === 'success') return json({ success: true, status: 'success', otp: order.otp_code });
  if (['refunded', 'cancelled', 'failed', 'expired'].includes(order.status)) return json({ success: true, status: order.status, otp: null });

  const last = order.last_otp_check_at ? new Date(order.last_otp_check_at).getTime() : 0;
  if (Date.now() - last < 3000) return error('Tunggu beberapa detik sebelum mengecek OTP lagi.', 429, 'RATE_LIMITED');
  const { data: allowed } = await admin.rpc('touch_order_otp_check', { p_user_id: user.id, p_order_id: id });
  if (!allowed) return error('Tunggu beberapa detik sebelum mengecek OTP lagi.', 429, 'RATE_LIMITED');

  try {
    const result = await getOrderStatus(order.provider_activation_id);
    const remote = result?.data || {};
    const otp = remote.otp_code ? String(remote.otp_code) : null;
    if (otp) {
      await admin.rpc('complete_order_with_otp', { p_user_id: user.id, p_order_id: id, p_otp_code: otp });
      finishOrder(order.provider_activation_id).catch(() => {});
      return json({ success: true, status: 'success', otp });
    }
    const remoteStatus = String(remote.status || 'active').toLowerCase();
    if (['cancelled', 'canceled', 'expired'].includes(remoteStatus)) {
      const { data: started } = await admin.rpc('begin_order_refund', { p_user_id: user.id, p_order_id: id });
      if (started) {
        const { data: refunded } = await admin.rpc('finalize_order_refund', { p_user_id: user.id, p_order_id: id });
        if (refunded) return json({ success: true, status: 'refunded', otp: null });
      }
      return json({ success: true, status: remoteStatus === 'expired' ? 'expired' : 'cancelled', otp: null });
    }
    return json({ success: true, status: 'pending', otp: null });
  } catch (err) { return error(err.message || 'Gagal mengecek OTP Nokosnesia.', err.status || 502); }
}

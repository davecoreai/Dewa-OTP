import { json, error } from '../../../../../lib/http';
import { requireUser, createSupabaseAdminClient } from '../../../../../lib/supabase';
import { getOrderStatus, nokosRequest } from '../../../../../lib/nokos';

export async function POST(_request, context) {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const admin = await createSupabaseAdminClient();
  const { id } = await context.params;
  const { data: order } = await supabase.from('orders').select('id, provider_activation_id, status, price').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!order) return error('Pesanan tidak ditemukan.', 404);
  if (order.status === 'success') return error('OTP sudah masuk. Pesanan berstatus Success dan tidak dapat direfund.', 409);
  if (order.status === 'refunded') return error('Pesanan ini sudah direfund.', 409);
  if (!['pending', 'refunding'].includes(order.status)) return error('Status pesanan belum memenuhi syarat refund.', 409);

  const { data: started, error: startError } = await admin.rpc('begin_order_refund', { p_user_id: user.id, p_order_id: id });
  if (startError || !started) return error('Refund tidak dapat dimulai. Status pesanan mungkin sudah berubah.', 409);
  try {
    const before = await getOrderStatus(order.provider_activation_id);
    if (before?.data?.status === 'STATUS_OK' && before?.data?.code) {
      await admin.rpc('complete_order_with_otp', { p_user_id: user.id, p_order_id: id, p_otp_code: String(before.data.code) });
      return error('OTP ternyata sudah masuk. Pesanan ditandai Success dan tidak direfund.', 409);
    }
    const cancelled = await nokosRequest('cancelActivation', { method: 'POST', body: { id: order.provider_activation_id } });
    if (cancelled.success === false) throw new Error(cancelled.error || 'Provider menolak pembatalan.');
    const after = await getOrderStatus(order.provider_activation_id);
    if (after?.data?.status === 'STATUS_OK' && after?.data?.code) {
      await admin.rpc('complete_order_with_otp', { p_user_id: user.id, p_order_id: id, p_otp_code: String(after.data.code) });
      return error('OTP masuk saat proses refund. Saldo tidak dikembalikan dan pesanan berstatus Success.', 409);
    }
    const { data: refunded, error: refundError } = await admin.rpc('finalize_order_refund', { p_user_id: user.id, p_order_id: id });
    if (refundError || !refunded) return error('Provider membatalkan nomor, tetapi refund saldo perlu rekonsiliasi administrator. Simpan ID: ' + id, 500);
    return json({ success: true, status: 'refunded', refundAmount: order.price });
  } catch (err) {
    await admin.rpc('restore_order_after_refund_error', { p_user_id: user.id, p_order_id: id });
    return error(err.message || 'Refund belum dapat diproses. Saldo belum diubah.', 502);
  }
}

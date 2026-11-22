import { json, error } from '../../../../../lib/http';
import { requireUser, createSupabaseAdminClient } from '../../../../../lib/supabase';
import { getOrderStatus, cancelOrder } from '../../../../../lib/nokosnesia';

export async function POST(_request, context) {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const admin = await createSupabaseAdminClient();
  const { id } = await context.params;
  const { data: order } = await supabase.from('orders')
    .select('id,provider_activation_id,status,price')
    .eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!order) return error('Pesanan tidak ditemukan.', 404);
  if (order.status === 'success') return error('OTP sudah masuk. Pesanan tidak dapat direfund.', 409);
  if (order.status === 'refunded') return error('Pesanan ini sudah direfund.', 409);
  if (!['pending', 'refunding'].includes(order.status)) return error('Status pesanan belum memenuhi syarat refund.', 409);

  const { data: started, error: startError } = await admin.rpc('begin_order_refund', { p_user_id: user.id, p_order_id: id });
  if (startError) return error('Refund tidak dapat dikunci. Coba periksa status pesanan kembali.', 500);
  if (!started) {
    const { data: latest } = await supabase.from('orders').select('status').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (latest?.status === 'refunded') return json({ success: true, status: 'refunded', refundAmount: order.price, duplicate: true });
    if (latest?.status === 'success') return error('OTP sudah masuk. Pesanan tidak dapat direfund.', 409);
    if (latest?.status !== 'refunding') return error('Refund tidak dapat dimulai. Status pesanan mungkin sudah berubah.', 409);
  }
  try {
    const before = await getOrderStatus(order.provider_activation_id);
    const beforeData = before?.data || {};
    if (beforeData.otp_code) {
      await admin.rpc('complete_order_with_otp', { p_user_id: user.id, p_order_id: id, p_otp_code: String(beforeData.otp_code) });
      return error('OTP sudah diterima. Pesanan ditandai berhasil dan tidak direfund.', 409);
    }
    await cancelOrder(order.provider_activation_id);
    const { data: refunded, error: refundError } = await admin.rpc('finalize_order_refund', { p_user_id: user.id, p_order_id: id });
    if (refundError || !refunded) {
      const { data: latest } = await supabase.from('orders').select('status').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (latest?.status === 'refunded') return json({ success: true, status: 'refunded', refundAmount: order.price, duplicate: true });
      return error('Nokosnesia telah menerima pembatalan, tetapi pengembalian saldo DEWA OTP perlu rekonsiliasi administrator. Simpan ID: ' + id, 500);
    }
    return json({ success: true, status: 'refunded', refundAmount: order.price });
  } catch (err) {
    // Jika pembatalan gagal akibat OTP masuk, cek ulang sebelum memulihkan status pending.
    try {
      const after = await getOrderStatus(order.provider_activation_id);
      if (after?.data?.otp_code) {
        await admin.rpc('complete_order_with_otp', { p_user_id: user.id, p_order_id: id, p_otp_code: String(after.data.otp_code) });
        return error('OTP telah diterima saat proses pembatalan. Refund ditolak.', 409);
      }
      const providerStatus = String(after?.data?.status || '').toLowerCase();
      if (['cancelled', 'canceled', 'expired'].includes(providerStatus)) {
        const { data: refunded } = await admin.rpc('finalize_order_refund', { p_user_id: user.id, p_order_id: id });
        if (refunded) return json({ success: true, status: 'refunded', refundAmount: order.price });
      }
    } catch { /* Preserve original provider error and restore pending state below. */ }
    const { data: latest } = await supabase.from('orders').select('status').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (latest?.status === 'refunded') return json({ success: true, status: 'refunded', refundAmount: order.price, duplicate: true });
    if (latest?.status !== 'success') await admin.rpc('restore_order_after_refund_error', { p_user_id: user.id, p_order_id: id });
    return error(err.message || 'Pembatalan belum dapat diproses. Saldo DEWA OTP belum diubah.', err.status || 502);
  }
}

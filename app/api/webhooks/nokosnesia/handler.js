import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabase';
import { finishOrder } from '../../../../lib/nokosnesia';
import { verifyNokosnesiaWebhookSignature } from '../../../../lib/nokosnesia-webhook';

export const runtime = 'nodejs';

function reply(status, payload) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const secret = process.env.NOKOSNESIA_WEBHOOK_SECRET;
  if (!secret) return reply(503, { success: false, error: 'Webhook Nokosnesia belum dikonfigurasi.' });

  const rawBody = await request.text();
  const signature = request.headers.get('x-nokosnesia-signature');
  if (!verifyNokosnesiaWebhookSignature(rawBody, signature, secret)) return reply(401, { success: false, error: 'Signature webhook tidak valid.' });

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return reply(400, { success: false, error: 'Payload JSON tidak valid.' }); }
  const event = String(payload?.event ?? payload?.type ?? payload?.name ?? '').toLowerCase();
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const orderData = data?.order && typeof data.order === 'object' ? data.order : data;
  const providerOrderId = String(data?.order_id ?? data?.orderId ?? orderData?.order_id ?? orderData?.id ?? data?.id ?? '').trim();
  if (!event) return reply(400, { success: false, error: 'Nama event webhook tidak ditemukan.' });

  // Deposit Nokosnesia hanya menambah saldo akun Nokosnesia, bukan saldo wallet pengguna DEWA OTP.
  if (event === 'deposit.completed') return reply(200, { success: true, accepted: true, event, handled: false });
  if (!['order.otp_received', 'order.cancelled', 'order.completed'].includes(event)) {
    return reply(200, { success: true, accepted: true, event, ignored: true });
  }
  if (!providerOrderId || providerOrderId.length > 128) return reply(400, { success: false, error: 'ID pesanan provider tidak ditemukan.' });

  try {
    const admin = await createSupabaseAdminClient();
    const { data: order, error: lookupError } = await admin.from('orders')
      .select('id,user_id,status,phone_number')
      .eq('provider_activation_id', providerOrderId)
      .maybeSingle();
    if (lookupError) return reply(500, { success: false, error: 'Gagal mencari order provider.' });
    if (!order) return reply(404, { success: false, error: 'Order Nokosnesia tidak ditemukan.' });
    if (order.status === 'success') return reply(200, { success: true, duplicate: true });

    if (event === 'order.otp_received' || (event === 'order.completed' && (data?.otp_code || data?.code || data?.otp?.code || orderData?.otp_code || orderData?.code))) {
      const phone = String(data?.phone_number ?? data?.phone ?? orderData?.phone_number ?? orderData?.phone ?? '').trim();
      if (phone && order.phone_number && phone !== String(order.phone_number)) return reply(409, { success: false, error: 'Nomor webhook tidak cocok dengan order.' });
      const otp = String(data?.otp_code ?? data?.code ?? data?.sms_code ?? data?.otp?.code ?? orderData?.otp_code ?? orderData?.code ?? '').trim();
      if (!otp || otp.length > 256) return reply(400, { success: false, error: 'Kode OTP tidak ditemukan pada payload.' });
      if (!['pending', 'refunding'].includes(order.status)) return reply(200, { success: true, ignored: true, status: order.status });
      const { data: completed, error: updateError } = await admin.rpc('complete_order_with_otp', {
        p_user_id: order.user_id,
        p_order_id: order.id,
        p_otp_code: otp
      });
      if (updateError) return reply(500, { success: false, error: 'Gagal menyimpan OTP.' });
      if (completed) finishOrder(providerOrderId).catch(() => {});
      return reply(200, { success: true, received: Boolean(completed), duplicate: !completed });
    }

    if (event === 'order.cancelled') {
      if (order.status === 'pending') {
        const { data: started, error: startError } = await admin.rpc('begin_order_refund', { p_user_id: order.user_id, p_order_id: order.id });
        if (startError) return reply(500, { success: false, error: 'Gagal mengunci proses refund.' });
        if (!started) {
          const { data: latest } = await admin.from('orders').select('status').eq('id', order.id).maybeSingle();
          if (latest?.status !== 'refunding') return reply(200, { success: true, ignored: true, status: latest?.status || order.status });
        }
      } else if (order.status !== 'refunding') {
        return reply(200, { success: true, ignored: true, status: order.status });
      }
      const { data: refunded, error: refundError } = await admin.rpc('finalize_order_refund', { p_user_id: order.user_id, p_order_id: order.id });
      if (refundError || !refunded) return reply(500, { success: false, error: 'Saldo pengguna perlu rekonsiliasi.' });
      return reply(200, { success: true, refunded: true });
    }

    return reply(200, { success: true, accepted: true, event });
  } catch {
    return reply(500, { success: false, error: 'Webhook internal error.' });
  }
}

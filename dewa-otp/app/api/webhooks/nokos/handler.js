import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabase';
import { nokosRequest } from '../../../../lib/nokos';

export const runtime = 'nodejs';

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function reply(status, payload) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Nokos callback: activation_id, phone_number, sms_code (per provider quick-start).
// Authenticate with the per-project secret configured in Nokos dashboard URL (?key=...)
// or with x-webhook-secret / Authorization: Bearer when provider supports custom headers.
export async function POST(request) {
  const expected = process.env.NOKOS_WEBHOOK_SECRET;
  if (!expected || expected.length < 32) {
    return reply(503, { success: false, error: 'Webhook belum dikonfigurasi dengan secret yang kuat.' });
  }

  const url = new URL(request.url);
  const supplied = request.headers.get('x-webhook-secret')
    || request.headers.get('x-nokos-webhook-secret')
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || url.searchParams.get('key');
  if (!safeEqual(supplied, expected)) return reply(401, { success: false, error: 'Webhook authentication failed.' });

  let body;
  try { body = await request.json(); } catch { return reply(400, { success: false, error: 'Payload JSON tidak valid.' }); }
  const data = body?.data && typeof body.data === 'object' ? body.data : body;
  const activationId = String(data?.activation_id ?? data?.id ?? '').trim();
  const phone = String(data?.phone_number ?? data?.phone ?? '').trim();
  const otp = String(data?.sms_code ?? data?.code ?? '').trim();
  if (!activationId || activationId.length > 128 || !otp || otp.length > 256) {
    return reply(400, { success: false, error: 'activation_id atau sms_code tidak lengkap.' });
  }

  try {
    const admin = await createSupabaseAdminClient();
    const { data: order, error: lookupError } = await admin
      .from('orders')
      .select('id,user_id,status,phone_number')
      .eq('provider_activation_id', activationId)
      .maybeSingle();
    if (lookupError) return reply(500, { success: false, error: 'Gagal mencari order provider.' });
    if (!order) return reply(404, { success: false, error: 'Order activation tidak ditemukan.' });
    if (phone && order.phone_number && phone !== String(order.phone_number)) {
      return reply(409, { success: false, error: 'Nomor callback tidak cocok dengan order.' });
    }
    if (order.status === 'success') return reply(200, { success: true, duplicate: true });
    if (!['pending', 'refunding'].includes(order.status)) {
      return reply(200, { success: true, ignored: true, status: order.status });
    }

    const { data: completed, error: updateError } = await admin.rpc('complete_order_with_otp', {
      p_user_id: order.user_id,
      p_order_id: order.id,
      p_otp_code: otp
    });
    if (updateError) return reply(500, { success: false, error: 'Gagal menyimpan OTP ke order.' });
    if (!completed) return reply(200, { success: true, duplicate: true });

    // Notify provider that activation is completed; database is already committed.
    nokosRequest('setStatus', { method: 'POST', body: { id: activationId, status: 6 } }).catch(() => {});
    return reply(200, { success: true, received: true });
  } catch {
    return reply(500, { success: false, error: 'Webhook internal error.' });
  }
}

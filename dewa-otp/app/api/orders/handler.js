import { json, error, readJson } from '../../../lib/http';
import { requireUser, createSupabaseAdminClient } from '../../../lib/supabase';
import { getServerQuotes, nokosRequest } from '../../../lib/nokos';

export async function POST(request) {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const body = await readJson(request);
  const service = String(body?.service || '').trim();
  const country = Number(body?.country ?? 6);
  const operator = String(body?.operator || 'any').trim();
  const idempotencyKey = String(body?.idempotencyKey || '');
  if (!/^[a-z0-9_-]{1,16}$/i.test(service) || !Number.isInteger(country) || !idempotencyKey || idempotencyKey.length > 100) return error('Data pesanan tidak valid.');

  try {
    const admin = await createSupabaseAdminClient();
    const quotes = await getServerQuotes(service, country);
    const quote = quotes[0];
    if (!quote) return error('Stok layanan tidak tersedia di kedua server.', 409, 'OUT_OF_STOCK');

    const { data: orderId, error: reserveError } = await admin.rpc('reserve_order_and_debit', {
      p_user_id: user.id,
      p_service_code: service,
      p_country_id: country,
      p_operator: operator,
      p_provider_server: quote.server,
      p_sale_price: quote.salePrice,
      p_provider_price: quote.providerPrice,
      p_idempotency_key: idempotencyKey
    });
    if (reserveError) return error(reserveError.message.includes('INSUFFICIENT') ? 'Saldo tidak mencukupi.' : reserveError.message, 409, 'RESERVE_FAILED');

    let created;
    try {
      created = await nokosRequest('getNumber', {
        method: 'POST',
        body: { service, country, operator, server: quote.server },
        idempotencyKey
      });
    } catch (providerError) {
      if (providerError.definitive) {
        await admin.rpc('refund_failed_order', { p_user_id: user.id, p_order_id: orderId });
        return error(providerError.message || 'Provider menolak pesanan. Saldo dikembalikan.', 502, 'PROVIDER_REJECTED');
      }
      throw providerError;
    }
    const activation = created?.data;
    if (!activation?.activation_id || !activation?.phone) throw new Error('Respons Nokos tidak lengkap; pesanan ditahan untuk rekonsiliasi.');

    const { data: attached, error: updateError } = await admin.rpc('attach_provider_activation', {
      p_user_id: user.id,
      p_order_id: orderId,
      p_activation_id: String(activation.activation_id),
      p_phone_number: String(activation.phone),
      p_expires_at: activation.expires_at || null
    });
    if (updateError || !attached) return error('Nomor berhasil dibuat, tetapi sinkronisasi database gagal. Hubungi bantuan dengan ID pesanan ' + orderId, 500, 'ORDER_SYNC_FAILED');
    return json({ success: true, orderId, providerOrderId: String(activation.activation_id), phone: activation.phone, price: quote.salePrice, server: quote.server, expiresAt: activation.expires_at || null });
  } catch (err) {
    // Jangan refund otomatis untuk timeout/response ambigu: provider mungkin sudah membuat nomor.
    return error(err.message || 'Gagal membuat pesanan. Periksa riwayat sebelum mencoba ulang.', 502, 'PROVIDER_ERROR');
  }
}

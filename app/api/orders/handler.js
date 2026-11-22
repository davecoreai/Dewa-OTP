import { json, error, readJson } from '../../../lib/http';
import { requireUser, createSupabaseAdminClient } from '../../../lib/supabase';
import { getProducts, createOrder } from '../../../lib/nokosnesia';

export async function POST(request) {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);

  const body = await readJson(request);
  const platformId = Number(body?.platformId ?? body?.service);
  const countryId = Number(body?.countryId ?? body?.country);
  const catalogProductId = Number(body?.catalogProductId || 0);
  const requestedOperatorId = body?.operatorId && body.operatorId !== 'any' ? Number(body.operatorId) : undefined;
  const idempotencyKey = String(body?.idempotencyKey || '').trim();
  if (!Number.isInteger(platformId) || platformId <= 0 || !Number.isInteger(countryId) || countryId <= 0 || !idempotencyKey || idempotencyKey.length > 100 || (requestedOperatorId !== undefined && (!Number.isInteger(requestedOperatorId) || requestedOperatorId <= 0))) return error('Data pesanan tidak valid.');

  const admin = await createSupabaseAdminClient();
  try {
    // Idempotency is checked before creating a new provider order.
    const { data: previous } = await supabase.from('orders')
      .select('id,provider_activation_id,phone_number,price,status,provider_expires_at,service_code')
      .eq('user_id', user.id).eq('idempotency_key', idempotencyKey).maybeSingle();
    if (previous?.provider_activation_id) {
      return json({ success: true, orderId: previous.id, providerOrderId: previous.provider_activation_id, phone: previous.phone_number, price: previous.price, provider: 'Nokosnesia', expiresAt: previous.provider_expires_at, status: previous.status, duplicate: true });
    }
    if (previous) {
      const message = previous.status === 'creating'
        ? 'Pesanan sebelumnya masih disinkronkan. Periksa riwayat sebelum mencoba kembali.'
        : 'Kunci pesanan ini sudah pernah dipakai. Buat permintaan baru hanya setelah memeriksa riwayat.';
      return error(message, 409, 'ORDER_PENDING_SYNC');
    }

    // Re-fetch the live product on the server. Never trust price or stock sent by the browser.
    const products = await getProducts({ countryId, platformId, operatorId: requestedOperatorId, sort: 'price_asc', limit: 100 });
    const available = products.filter(product => product.stock > 0).sort((a, b) => a.salePrice - b.salePrice);
    const selected = catalogProductId
      ? available.find(product => product.catalogProductId === catalogProductId)
      : available[0];
    if (!selected) return error('Produk tidak tersedia atau stok berubah. Muat ulang harga dan stok.', 409, 'OUT_OF_STOCK');
    const expectedPrice = Number(body?.expectedPrice);
    if (!Number.isSafeInteger(expectedPrice) || expectedPrice !== selected.salePrice) {
      return error('Harga berubah sejak katalog dimuat. Perbarui harga sebelum membeli.', 409, 'PRICE_CHANGED');
    }

    const operatorId = requestedOperatorId ?? selected.operatorId ?? undefined;
    const operatorLabel = selected.operatorName || 'Semua Operator';
    const serviceName = String(body?.serviceName || selected.name || `Layanan ${platformId}`).slice(0, 80);

    const { data: orderId, error: reserveError } = await admin.rpc('reserve_order_and_debit', {
      p_user_id: user.id,
      p_service_code: serviceName,
      p_country_id: countryId,
      p_operator: operatorId === undefined ? 'any' : String(operatorId),
      p_provider_server: 'nokosnesia',
      p_sale_price: selected.salePrice,
      p_provider_price: selected.providerPrice,
      p_idempotency_key: idempotencyKey
    });
    if (reserveError) {
      const insufficient = String(reserveError.message || '').includes('INSUFFICIENT');
      const cooldown = String(reserveError.message || '').includes('ORDER_COOLDOWN');
      return error(insufficient ? 'Saldo tidak mencukupi.' : cooldown ? 'Tunggu beberapa detik sebelum membuat pesanan berikutnya.' : reserveError.message, 409, insufficient ? 'INSUFFICIENT_BALANCE' : 'RESERVE_FAILED');
    }

    const { data: dispatchClaimed, error: dispatchError } = await admin.rpc('claim_order_provider_dispatch', {
      p_user_id: user.id,
      p_order_id: orderId
    });
    if (dispatchError) {
      await admin.rpc('refund_failed_order', { p_user_id: user.id, p_order_id: orderId });
      return error('Tidak dapat mengunci pengiriman order ke provider. Reservasi saldo dibatalkan; periksa riwayat sebelum mencoba lagi.', 500, 'ORDER_DISPATCH_LOCK_FAILED');
    }
    if (!dispatchClaimed) {
      const { data: latest } = await admin.from('orders')
        .select('id,provider_activation_id,phone_number,price,status,provider_expires_at')
        .eq('id', orderId).eq('user_id', user.id).maybeSingle();
      if (latest?.provider_activation_id) {
        return json({ success: true, orderId: latest.id, providerOrderId: latest.provider_activation_id, phone: latest.phone_number, price: latest.price, provider: 'Nokosnesia', expiresAt: latest.provider_expires_at, status: latest.status, duplicate: true });
      }
      return error('Pesanan sedang dikirim atau menunggu rekonsiliasi. Jangan membuat pesanan baru dengan kunci yang sama.', 409, 'ORDER_PENDING_SYNC');
    }

    await admin.from('orders').update({ provider_product_id: selected.catalogProductId, provider_platform_id: platformId, operator: operatorLabel }).eq('id', orderId);

    let created;
    try {
      const providerPayload = {
        catalog_product_id: selected.catalogProductId,
        country_id: countryId,
        platform_id: platformId,
        service_name: serviceName,
        country_name: selected.countryName || undefined,
        ...(operatorId === undefined ? {} : { operator_id: operatorId })
      };
      created = await createOrder(providerPayload, idempotencyKey);
    } catch (providerError) {
      if (providerError.definitive) {
        await admin.rpc('refund_failed_order', { p_user_id: user.id, p_order_id: orderId });
        return error(providerError.message || 'Nokosnesia menolak pesanan. Saldo DEWA OTP telah dikembalikan.', providerError.status || 502, 'PROVIDER_REJECTED');
      }
      throw providerError;
    }

    const providerOrder = created?.data;
    if (!providerOrder?.id || !providerOrder?.phone_number) throw new Error('Respons Nokosnesia belum lengkap. Pesanan ditahan untuk rekonsiliasi; jangan membeli ulang dulu.');
    const { data: attached, error: updateError } = await admin.rpc('attach_provider_activation', {
      p_user_id: user.id,
      p_order_id: orderId,
      p_activation_id: String(providerOrder.id),
      p_phone_number: String(providerOrder.phone_number),
      p_expires_at: providerOrder.expires_at || null
    });
    if (updateError || !attached) return error(`Nomor sudah dibuat tetapi sinkronisasi database gagal. Simpan ID pesanan ${orderId} dan hubungi bantuan.`, 500, 'ORDER_SYNC_FAILED');

    return json({
      success: true,
      orderId,
      providerOrderId: String(providerOrder.id),
      phone: providerOrder.phone_number,
      price: selected.salePrice,
      operator: operatorLabel,
      provider: 'Nokosnesia',
      expiresAt: providerOrder.expires_at || null
    });
  } catch (err) {
    // Timeout/5xx is ambiguous: never credit the wallet back automatically because provider may have created the number.
    return error(err.message || 'Gagal membuat pesanan. Periksa riwayat sebelum mencoba ulang.', err.status || 502, err.code || 'PROVIDER_ERROR');
  }
}

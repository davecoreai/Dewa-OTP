const BASE_URL = (process.env.NOKOSNESIA_BASE_URL || 'https://nokosnesia.com/api/v1').replace(/\/+$/, '');

function requireApiKey() {
  const key = process.env.NOKOSNESIA_API_KEY;
  if (!key) throw new Error('NOKOSNESIA_API_KEY belum diatur pada environment server.');
  return key;
}

export async function nokosnesiaRequest(path, { method = 'GET', query = {}, body, idempotencyKey } = {}) {
  const key = requireApiKey();
  const url = new URL(`${BASE_URL}/${String(path).replace(/^\/+/, '')}`);
  for (const [name, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
  }

  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || `Nokosnesia API gagal (HTTP ${response.status}).`);
    error.status = response.status;
    error.code = payload?.code || (response.status === 402 ? 'PROVIDER_BALANCE_LOW' : 'NOKOSNESIA_API_ERROR');
    error.definitive = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    throw error;
  }
  return payload;
}

function rowsFrom(payload, keys = []) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
}

export async function getCountries() {
  const payload = await nokosnesiaRequest('/catalog/countries');
  return rowsFrom(payload, ['countries']).map((item) => ({
    id: Number(item.id ?? item.country_id),
    name: String(item.name ?? item.country_name ?? ''),
    iso: String(item.iso ?? item.iso2 ?? ''),
    code: String(item.code ?? item.phone_code ?? '')
  })).filter(item => Number.isInteger(item.id) && item.name);
}

export async function getServices(countryId) {
  const payload = await nokosnesiaRequest('/catalog/services', { query: { country_id: countryId } });
  return rowsFrom(payload, ['services']).map((item) => {
    const platformId = Number(item.platform_id ?? item.platformId ?? item.id ?? item.service_id);
    const name = String(item.name ?? item.service_name ?? item.title ?? item.code ?? '');
    const code = String(item.code ?? item.service_code ?? platformId);
    return { id: Number(item.id ?? platformId), platformId, code, name, category: String(item.category ?? '') };
  }).filter(item => Number.isInteger(item.platformId) && item.platformId > 0 && item.name);
}

export async function getOperators(countryId, platformId) {
  const payload = await nokosnesiaRequest('/catalog/operators', {
    query: { country_id: countryId, platform_id: platformId }
  });
  return rowsFrom(payload, ['operators']).map((item) => {
    const idValue = item.operator_id ?? item.id;
    return {
      id: idValue === null || idValue === undefined || idValue === '' ? null : Number(idValue),
      name: String(item.name ?? item.operator_name ?? item.label ?? 'Operator')
    };
  }).filter(item => item.id === null || (Number.isInteger(item.id) && item.id > 0));
}

export async function getProducts({ countryId, platformId, operatorId, page = 1, limit = 100, sort = 'price_asc' }) {
  const payload = await nokosnesiaRequest('/catalog/products', {
    query: {
      country_id: countryId,
      platform_id: platformId,
      operator_id: operatorId,
      sort,
      page,
      limit: Math.min(100, Math.max(1, Number(limit) || 100))
    }
  });
  const configuredMarkup = Number(process.env.PRICE_MARKUP_PERCENT ?? 20);
  const markup = Number.isFinite(configuredMarkup) ? Math.min(500, Math.max(0, configuredMarkup)) : 20;
  return rowsFrom(payload, ['products']).map((item) => {
    const rawProviderPrice = Number(item.nokosnesia_price_idr ?? item.price_idr ?? item.price);
    const providerPrice = Math.round(rawProviderPrice);
    const stock = Number(item.quantity ?? item.stock ?? item.available ?? 0);
    const catalogProductId = Number(item.catalog_product_id ?? item.product_id);
    return {
      id: Number(item.id ?? catalogProductId),
      catalogProductId,
      platformId: Number(item.platform_id ?? platformId),
      operatorId: item.operator_id === null || item.operator_id === undefined || item.operator_id === '' ? null : Number(item.operator_id),
      operatorName: String(item.operator_name ?? 'Semua Operator'),
      name: String(item.name ?? ''),
      countryName: String(item.country_name ?? ''),
      providerPrice,
      salePrice: Number.isSafeInteger(providerPrice) ? Math.ceil(providerPrice * (1 + markup / 100)) : 0,
      stock: Number.isFinite(stock) ? Math.max(0, stock) : 0
    };
  }).filter(item => Number.isSafeInteger(item.catalogProductId) && item.catalogProductId > 0 && Number.isSafeInteger(item.platformId) && item.platformId > 0 && Number.isSafeInteger(item.providerPrice) && item.providerPrice > 0 && Number.isSafeInteger(item.salePrice) && item.salePrice > 0);
}

export function publicProduct(product) {
  if (!product || typeof product !== 'object') return null;
  const { providerPrice, ...safeProduct } = product;
  return safeProduct;
}

export async function getOrderStatus(orderId) {
  return nokosnesiaRequest(`/orders/${encodeURIComponent(orderId)}`);
}

export async function createOrder(payload, idempotencyKey) {
  return nokosnesiaRequest('/orders/create', { method: 'POST', body: payload, idempotencyKey });
}

export async function cancelOrder(orderId) {
  return nokosnesiaRequest(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST', body: {} });
}

export async function finishOrder(orderId) {
  return nokosnesiaRequest(`/orders/${encodeURIComponent(orderId)}/finish`, { method: 'POST', body: {} });
}

export async function resendOrder(orderId) {
  return nokosnesiaRequest(`/orders/${encodeURIComponent(orderId)}/resend`, { method: 'POST', body: {} });
}

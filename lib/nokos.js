const BASE_URL = process.env.NOKOS_BASE_URL || 'https://nokos.co.id/api/';

export async function nokosRequest(action, { method = 'GET', params = {}, body = {}, idempotencyKey } = {}) {
  if (!process.env.NOKOS_API_KEY) throw new Error('NOKOS_API_KEY belum diatur.');
  const url = new URL(BASE_URL);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const headers = { 'X-API-Key': process.env.NOKOS_API_KEY };
  if (method !== 'GET') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  const response = await fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const err = new Error(data.error || `Nokos API gagal (HTTP ${response.status}).`);
    err.definitive = data.success === false;
    throw err;
  }
  return data;
}

export async function getServerQuotes(service, country) {
  if (!process.env.NOKOS_API_KEY) throw new Error('NOKOS_API_KEY belum diatur.');
  const servers = ['s1', 's2'];
  const quotes = await Promise.all(servers.map(async (server) => {
    try {
      const data = await nokosRequest('getPrices', { params: { service, country, server } });
      const raw = data?.prices?.[String(country)]?.[service];
      if (!raw || Number(raw.count) <= 0) return null;
      const idrRate = Number(data.usd_idr_rate);
      const cost = Number(raw.cost);
      if (!Number.isFinite(idrRate) || !Number.isFinite(cost)) return null;
      const providerPrice = Math.round(cost * idrRate);
      const markup = Math.max(0, Number(process.env.PRICE_MARKUP_PERCENT || 20));
      return {
        server,
        serverName: server === 's2' ? 'Plus' : 'Ekonomi / Express',
        stock: Number(raw.count),
        providerPrice,
        salePrice: Math.ceil(providerPrice * (1 + markup / 100))
      };
    } catch {
      return null;
    }
  }));
  return quotes.filter(Boolean).sort((a, b) => a.salePrice - b.salePrice);
}

export async function getOrderStatus(activationId) {
  return nokosRequest('getStatus', { params: { id: activationId } });
}

export async function getCatalogPrices(country) {
  if (!process.env.NOKOS_API_KEY) throw new Error('NOKOS_API_KEY belum diatur.');
  const servers = ['s1', 's2'];
  const results = (await Promise.all(servers.map(async (server) => {
    try {
      const data = await nokosRequest('getPrices', { params: { country, server } });
      const rate = Number(data.usd_idr_rate);
      if (!Number.isFinite(rate)) return null;
      return { server, rate, prices: data?.prices?.[String(country)] || {} };
    } catch {
      return null;
    }
  }))).filter(Boolean);
  if (!results.length) throw new Error('Harga Nokos tidak dapat dimuat dari kedua server.');
  const markup = Math.max(0, Number(process.env.PRICE_MARKUP_PERCENT || 20));
  const catalog = {};
  for (const result of results) {
    for (const [service, raw] of Object.entries(result.prices)) {
      const cost = Number(raw?.cost);
      const stock = Number(raw?.count || 0);
      if (!Number.isFinite(cost) || stock < 0) continue;
      const providerPrice = Math.round(cost * result.rate);
      const salePrice = Math.ceil(providerPrice * (1 + markup / 100));
      const quote = {
        server: result.server,
        serverName: result.server === 's2' ? 'Plus' : 'Ekonomi / Express',
        stock,
        providerPrice,
        salePrice
      };
      const previous = catalog[service];
      if (!previous || (stock > 0 && previous.stock <= 0) || ((stock > 0) === (previous.stock > 0) && salePrice < previous.salePrice)) {
        catalog[service] = quote;
      }
    }
  }
  return catalog;
}

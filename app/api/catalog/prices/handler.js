import { json, error } from '../../../../lib/http';
import { requireUser } from '../../../../lib/supabase';
import { getServices, getProducts, publicProduct } from '../../../../lib/nokosnesia';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const countryId = Number(new URL(request.url).searchParams.get('country') || 7);
  if (!Number.isInteger(countryId) || countryId <= 0) return error('Negara tidak valid.');
  try {
    const services = await getServices(countryId);
    const prices = {};
    // Harga/stok dimuat secara lazy untuk layanan yang tampil; batasi concurrency agar ringan dan tidak memicu rate limit.
    const selectedServices = services.slice(0, 24);
    for (let i = 0; i < selectedServices.length; i += 4) {
      const batch = selectedServices.slice(i, i + 4);
      const results = await Promise.all(batch.map(async service => {
        const products = await getProducts({ countryId, platformId: service.platformId, sort: 'price_asc', limit: 100 });
        const available = products.filter(product => product.stock > 0).sort((a, b) => a.salePrice - b.salePrice);
        return [String(service.platformId), publicProduct(available[0])];
      }));
      for (const [id, quote] of results) if (quote) prices[id] = quote;
    }
    return json({ success: true, prices, truncated: services.length > selectedServices.length });
  } catch (err) { return error(err.message || 'Gagal mengambil katalog harga.', err.status || 502); }
}

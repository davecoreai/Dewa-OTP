import { json, error } from '../../../../lib/http';
import { requireUser } from '../../../../lib/supabase';
import { getProducts, publicProduct } from '../../../../lib/nokosnesia';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const url = new URL(request.url);
  const countryId = Number(url.searchParams.get('country'));
  const platformId = Number(url.searchParams.get('platform'));
  const rawOperator = url.searchParams.get('operator');
  const operatorId = rawOperator && rawOperator !== 'any' ? Number(rawOperator) : undefined;
  if (!Number.isInteger(countryId) || countryId <= 0 || !Number.isInteger(platformId) || platformId <= 0 || (operatorId !== undefined && (!Number.isInteger(operatorId) || operatorId <= 0))) return error('Filter katalog tidak valid.');
  try {
    const products = await getProducts({ countryId, platformId, operatorId, sort: 'price_asc', limit: 100 });
    const available = products.filter(product => product.stock > 0).sort((a, b) => a.salePrice - b.salePrice);
    return json({ success: true, products: products.map(publicProduct), selected: publicProduct(available[0]) });
  } catch (err) { return error(err.message || 'Gagal mengambil stok dan harga.', err.status || 502); }
}

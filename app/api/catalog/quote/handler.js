import { json, error } from '../../../../lib/http';
import { requireUser } from '../../../../lib/supabase';
import { getProducts, getOperators, publicProduct } from '../../../../lib/nokosnesia';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const url = new URL(request.url);
  const platformId = Number(url.searchParams.get('service'));
  const countryId = Number(url.searchParams.get('country'));
  const rawOperator = url.searchParams.get('operator');
  const operatorId = rawOperator && rawOperator !== 'any' ? Number(rawOperator) : undefined;
  if (!Number.isInteger(platformId) || platformId <= 0 || !Number.isInteger(countryId) || countryId <= 0 || (operatorId !== undefined && (!Number.isInteger(operatorId) || operatorId <= 0))) return error('Layanan, negara, atau operator tidak valid.');
  try {
    const [products, operators] = await Promise.all([
      getProducts({ countryId, platformId, operatorId, sort: 'price_asc', limit: 100 }),
      getOperators(countryId, platformId)
    ]);
    const available = products.filter(product => product.stock > 0).sort((a, b) => a.salePrice - b.salePrice);
    return json({ success: true, selected: publicProduct(available[0]), operators });
  } catch (err) { return error(err.message || 'Gagal memuat harga dan stok.', err.status || 502); }
}

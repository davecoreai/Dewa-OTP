import { json, error } from '../../../../lib/http';
import { requireUser } from '../../../../lib/supabase';
import { getCatalogPrices } from '../../../../lib/nokos';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const country = Number(new URL(request.url).searchParams.get('country') || 6);
  if (!Number.isInteger(country)) return error('Negara tidak valid.');
  try {
    const prices = await getCatalogPrices(country);
    return json({ success: true, prices });
  } catch (err) { return error(err.message || 'Gagal mengambil harga katalog.', 502); }
}

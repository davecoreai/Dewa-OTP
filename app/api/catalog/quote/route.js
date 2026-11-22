import { json, error } from '../../../../lib/http';
import { requireUser } from '../../../../lib/supabase';
import { getServerQuotes } from '../../../../lib/nokos';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const url = new URL(request.url);
  const service = url.searchParams.get('service');
  const country = Number(url.searchParams.get('country') || 6);
  if (!service || !/^[a-z0-9_-]{1,16}$/i.test(service) || !Number.isInteger(country)) return error('Layanan atau negara tidak valid.');
  try {
    const quotes = await getServerQuotes(service, country);
    return json({ success: true, quotes, selected: quotes[0] || null });
  } catch (err) { return error(err.message || 'Gagal mengambil harga.', 502); }
}

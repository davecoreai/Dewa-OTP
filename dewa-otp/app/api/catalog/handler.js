import { json, error } from '../../../lib/http';
import { requireUser } from '../../../lib/supabase';
import { nokosRequest } from '../../../lib/nokos';
export const dynamic = 'force-dynamic';
export async function GET() {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  try {
    const [services, countries] = await Promise.all([
      nokosRequest('getServices'),
      nokosRequest('getCountries')
    ]);
    return json({ success: true, services: services.data || [], countries: countries.data || [] });
  } catch (err) { return error(err.message || 'Gagal mengambil katalog Nokos.', 502); }
}

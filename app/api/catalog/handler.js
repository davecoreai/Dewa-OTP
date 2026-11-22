import { json, error } from '../../../lib/http';
import { requireUser } from '../../../lib/supabase';
import { getCountries, getServices } from '../../../lib/nokosnesia';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const countryId = new URL(request.url).searchParams.get('country_id') || undefined;
  try {
    const countries = countryId ? [] : await getCountries();
    const services = countryId ? await getServices(countryId) : [];
    return json({ success: true, countries, services, provider: 'Nokosnesia' });
  } catch (err) {
    return error(err.message || 'Gagal mengambil katalog Nokosnesia.', err.status || 502);
  }
}

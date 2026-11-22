import { json, error } from '../../../../lib/http';
import { requireUser } from '../../../../lib/supabase';
import { getOperators } from '../../../../lib/nokosnesia';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const url = new URL(request.url);
  const countryId = Number(url.searchParams.get('country'));
  const platformId = Number(url.searchParams.get('platform'));
  if (!Number.isInteger(countryId) || countryId <= 0 || !Number.isInteger(platformId) || platformId <= 0) return error('Negara atau layanan tidak valid.');
  try {
    const operators = await getOperators(countryId, platformId);
    return json({ success: true, operators });
  } catch (err) { return error(err.message || 'Gagal mengambil daftar operator.', err.status || 502); }
}

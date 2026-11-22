import { json, error } from '../../../../lib/http';
import { requireUser } from '../../../../lib/supabase';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return error('Belum login.', 401, 'UNAUTHENTICATED');
    const [{ data: profile }, { data: wallet }] = await Promise.all([
      supabase.from('profiles').select('full_name, username').eq('id', user.id).maybeSingle(),
      supabase.from('wallets').select('balance').eq('user_id', user.id).maybeSingle()
    ]);
    return json({ success: true, user: { id: user.id, email: user.email, name: profile?.full_name || user.user_metadata?.full_name || '', username: profile?.username || user.user_metadata?.username || '' }, balance: wallet?.balance || 0 });
  } catch (err) { return error(err.message || 'Gagal mengambil sesi.', 500); }
}

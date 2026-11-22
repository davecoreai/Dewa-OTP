import { json, error } from '../../../lib/http';
import { requireUser } from '../../../lib/supabase';
export const dynamic = 'force-dynamic';
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const [{ data: orders, error: ordersError }, { data: deposits, error: depositsError }, { data: wallet }] = await Promise.all([
    supabase.from('orders').select('id, provider_activation_id, service_code, phone_number, price, status, created_at, otp_code').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('deposits').select('id, amount, status, created_at, gateway_reference').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('wallets').select('balance').eq('user_id', user.id).maybeSingle()
  ]);
  if (ordersError || depositsError) return error('Gagal mengambil riwayat.', 500);
  return json({ success: true, orders: orders || [], deposits: deposits || [], balance: wallet?.balance || 0 });
}

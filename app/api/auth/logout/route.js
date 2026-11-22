import { json } from '../../../../lib/http';
import { createSupabaseServerClient } from '../../../../lib/supabase';
export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return json({ success: true });
}

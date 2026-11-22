import { json, error } from '../../../../lib/http';
import { createSupabaseServerClient } from '../../../../lib/supabase';
export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/auth/callback` }
    });
    if (oauthError) return error(oauthError.message, 400);
    return json({ success: true, url: data.url });
  } catch (err) { return error(err.message || 'Google OAuth belum siap.', 500); }
}

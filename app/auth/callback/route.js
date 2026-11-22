import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const next = url.searchParams.get('next');
  const target = next === '/reset-password' ? '/dashboard?recovery=1' : '/dashboard';
  return NextResponse.redirect(new URL(target, url.origin));
}

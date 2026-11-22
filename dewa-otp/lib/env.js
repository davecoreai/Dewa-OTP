export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export function hasNokosConfig() {
  return Boolean(process.env.NOKOS_API_KEY);
}
export function publicConfig() {
  return {
    recaptchaSiteKey: process.env.RECAPTCHA_SECRET_KEY && process.env.RECAPTCHA_SITE_KEY ? process.env.RECAPTCHA_SITE_KEY : '',
    supabaseConfigured: hasSupabaseConfig(),
    nokosConfigured: hasNokosConfig(),
    paymentsConfigured: false,
    aiConfigured: Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL)
  };
}

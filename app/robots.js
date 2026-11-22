const SITE = 'https://dewaotp.my.id';

export default function robots() {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/callback', '/dashboard']
    }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE
  };
}

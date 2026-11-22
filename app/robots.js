const SITE = 'https://dewaotp.my.id';

export default function robots() {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/callback', '/index.html?recovery=']
    }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE
  };
}

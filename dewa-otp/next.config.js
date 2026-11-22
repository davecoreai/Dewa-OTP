/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/index.html', destination: '/dashboard', permanent: true }];
  },
  async rewrites() {
    return [
      { source: '/dashboard', destination: '/index.html' },
      { source: '/_core/appearance', destination: '/css/global.css' },
      { source: '/_core/interface', destination: '/js/app.js' },
      { source: '/_static/mark', destination: '/favicon.svg' },
      { source: '/_static/preview', destination: '/og-dewa-otp.svg' }
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ]
      }
    ];
  }
};
module.exports = nextConfig;

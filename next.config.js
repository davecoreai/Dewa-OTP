/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: '/index.html', destination: '/dashboard', permanent: true },
      { source: '/index', destination: '/dashboard', permanent: true }
    ];
  },
  async rewrites() {
    return [
      { source: '/dashboard', destination: '/index.html' },
      { source: '/interface', destination: '/_ui-core-91c2.css' },
      { source: '/portal', destination: '/_client-4f82.js' }
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

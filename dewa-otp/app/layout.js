const SITE = 'https://dewaotp.my.id';

export const metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'DEWA OTP — Platform Nomor Virtual & Verifikasi OTP',
    template: '%s | DEWA OTP'
  },
  description: 'DEWA OTP adalah platform pengelolaan nomor virtual dan pesanan kode verifikasi OTP dengan dashboard akun, saldo, dan riwayat transaksi.',
  applicationName: 'DEWA OTP',
  category: 'technology',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: SITE,
    siteName: 'DEWA OTP',
    title: 'DEWA OTP — Platform Nomor Virtual & Verifikasi OTP',
    description: 'Kelola nomor virtual, saldo, dan pesanan OTP melalui dashboard DEWA OTP.',
    images: [{ url: '/_static/preview', width: 1200, height: 630, alt: 'DEWA OTP platform' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DEWA OTP — Platform Nomor Virtual & Verifikasi OTP',
    description: 'Kelola nomor virtual, saldo, dan pesanan OTP melalui dashboard DEWA OTP.',
    images: ['/_static/preview']
  },
  icons: { icon: '/_static/mark', shortcut: '/_static/mark', apple: '/_static/mark' }
};

export default function RootLayout({ children }) {
  return <html lang="id"><head><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" crossOrigin="anonymous" referrerPolicy="no-referrer" /></head><body>{children}</body></html>;
}

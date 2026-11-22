# DEWA OTP

Project DEWA OTP dengan frontend **HTML + CSS + Vanilla JavaScript** dan backend **Next.js Route Handlers**, Supabase PostgreSQL, Nokos API, DOKU payment route (fail-closed until merchant-specific integration is configured), serta Sonny AI melalui OpenRouter.

## Isi project

- Login email/password, Register, Google OAuth entry point, reCAPTCHA v2 checkbox.
- Dashboard, statistik pribadi, saldo, Beli Nomor, halaman OTP, refund, Beli Saldo, Riwayat, Akun & Keamanan, Sonny AI.
- Responsive layout untuk desktop, tablet, dan mobile; sidebar menjadi drawer pada layar kecil.
- Auto-polling OTP setiap 6 detik ketika halaman detail pesanan terbuka; berhenti setelah status final atau halaman ditinggalkan.
- API auth berbasis sesi Supabase di cookie HttpOnly/Secure sesuai konfigurasi platform.
- Database schema dengan RLS, wallet ledger, atomic reservation/debit, dan refund yang idempotent.
- Pemilihan server Nokos otomatis berdasarkan harga jual terendah yang stoknya tersedia.

## Jalankan lokal

Persyaratan: Node.js 22+, npm, project Supabase.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Buka `http://localhost:3000`.

## Setup Supabase

1. Buat project PostgreSQL baru di Supabase.
2. Buka SQL Editor dan jalankan seluruh isi `sql/schema.sql`.
3. Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` di `.env.local`.
4. Di Supabase Auth, aktifkan email confirmation, atur SMTP produksi, dan tambahkan URL redirect `http://localhost:3000/auth/callback` serta domain produksi.
5. Untuk Google login, aktifkan provider Google di Supabase Auth dan isi Client ID/Secret OAuth Google pada dashboard Supabase.
6. Buat reCAPTCHA v2 Checkbox pada Google reCAPTCHA Admin, daftarkan domain localhost dan domain produksi, lalu isi `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` serta `RECAPTCHA_SECRET_KEY`. Widget resmi dimuat dari Google; backend memverifikasi token ke SiteVerify, fail-closed jika key/token tidak tersedia, dan memeriksa hostname hasil verifikasi.

## Setup Nokos

1. Ambil API key di dashboard Nokos dan simpan sebagai `NOKOS_API_KEY` pada server environment saja.
2. Base URL default adalah `https://nokos.co.id/api/`.
3. Sistem melakukan quote terhadap `s1` dan `s2`, lalu memilih harga terendah yang stoknya tersedia.
4. Dokumentasi Nokos saat project ini dibuat menyebut `s1` sebagai **Server Express** dan `s2` sebagai **Server Plus**. Label UI menuliskan `Ekonomi / Express` untuk `s1` agar tidak salah menyebut tipe server provider.
5. Setelah login, kartu aplikasi diambil dari endpoint `getServices` Nokos sehingga kode layanan mengikuti katalog aktual provider. Tidak ada katalog contoh atau transaksi demo; jika provider tidak tersedia, UI menampilkan status gagal dan transaksi tidak dibuat.
6. Atur `PRICE_MARKUP_PERCENT` sesuai skema margin bisnis Anda.

**Penting:** route order mengunci harga jual dari quote sebelum debit wallet. Karena pemanggilan provider adalah transaksi eksternal, timeout/response ambigu sengaja tidak di-refund otomatis; lakukan rekonsiliasi berdasarkan ID order/provider agar tidak terjadi double number atau refund saat provider sebenarnya sudah membuat nomor.

## Setup DOKU

Halaman QRIS dan endpoint `/api/payments` sengaja **fail-closed** (HTTP 503) karena integrasi QRIS DOKU belum selesai dengan kontrak merchant yang spesifik. Ini bukan simulasi pembayaran; tidak ada QR palsu atau saldo demo. Jangan digunakan untuk menerima uang sebelum:

- Merchant DOKU disetujui untuk model bisnis DEWA OTP.
- Request create payment QRIS dibangun sesuai dokumen dan kredensial merchant Anda.
- Webhook signature, amount, order reference, status, dan idempotency diverifikasi di backend.
- Pengkreditan wallet dilakukan dalam satu transaksi PostgreSQL yang idempotent.

Jangan mengisi konfigurasi dengan nilai contoh atau menganggap format signature. Konfirmasikan penerimaan kategori bisnis dengan DOKU terlebih dahulu.

## Setup Sonny AI

Isi `OPENROUTER_API_KEY` dan `OPENROUTER_MODEL`. API key hanya dibaca di backend. Sonny dibatasi untuk bantuan informasi DEWA OTP dan tidak mempunyai akses ke data privat transaksi atau pengguna lain.

## Environment variables

Lihat `.env.example`. Semua key tanpa prefix `NEXT_PUBLIC_` hanya boleh ada di environment server/Vercel. `SUPABASE_SERVICE_ROLE_KEY` tidak boleh pernah dikirim ke browser. Jangan commit `.env.local`.

## API yang tersedia

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/config` | Konfigurasi publik non-rahasia |
| POST | `/api/auth/register` | Register + reCAPTCHA |
| POST | `/api/auth/login` | Login email/password |
| GET | `/api/auth/google` | Memulai Google OAuth |
| GET | `/api/auth/me` | Profil sesi aktif + saldo |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/reset-password` | Email reset password |
| POST | `/api/auth/update-password` | Menyimpan password baru dari sesi recovery |
| POST | `/api/auth/change-password` | Verifikasi password lama lalu ganti password |
| PATCH | `/api/profile` | Update nama profil |
| GET | `/api/catalog` | Services & countries Nokos |
| GET | `/api/catalog/quote` | Quote harga/stok s1 dan s2 untuk layanan terpilih |
| GET | `/api/catalog/prices` | Harga dan stok seluruh katalog provider |
| POST | `/api/orders` | Reserve saldo dan beli nomor |
| GET | `/api/orders/:id/otp` | Cek status OTP (rate limited) |
| POST | `/api/orders/:id/refund` | Refund provider-confirmed |
| GET | `/api/history` | Riwayat pengguna aktif |
| POST | `/api/payments` | DOKU belum dikonfigurasi; fail-closed tanpa simulasi |
| POST | `/api/sonny` | Sonny AI |

## Sebelum produksi

- Cocokkan seluruh kode layanan Nokos dengan katalog akun Anda. Statistik global tidak menampilkan angka palsu; tetap `—` sampai endpoint agregasi platform yang aman dan terotorisasi ditambahkan.
- Lengkapi DOKU adapter dan webhook yang terverifikasi.
- Tambahkan rate limiting terdistribusi untuk auth, order, dan Sonny (mis. Redis/Upstash/WAF); batas cek OTP per order sudah ada di handler, tetapi bukan pengganti rate limiter edge.
- Tambahkan halaman syarat layanan, kebijakan privasi, kontak bantuan, logging, monitoring, backup database, dan prosedur rekonsiliasi transaksi.
- Review kebijakan penggunaan layanan OTP pihak ketiga serta persyaratan legal dan provider aplikasi tujuan.
- Uji bersamaan (concurrency), retry/idempotency, kegagalan jaringan, OTP datang ketika refund berjalan, serta callback pembayaran berulang di staging.

## Struktur ringkas

```text
dewa-otp/
├── app/
│   ├── api/                 # Next.js serverless route handlers
│   ├── auth/callback/       # Supabase OAuth callback
│   ├── layout.js
│   └── page.js              # redirect ke static Vanilla JS UI
├── lib/                     # Supabase, Nokos, HTTP, security helpers
├── public/
│   ├── css/global.css
│   ├── js/app.js
│   └── index.html
├── sql/schema.sql
├── .env.example
└── README.md
```

Catatan: folder project dipisah dengan nama `dewa-otp` (tanpa spasi).

# DEWA OTP

Rilis proyek: **v8 — Nokosnesia + Liquid Glass**. Ringkasan perubahan berada di `CHANGELOG.md`. Dokumentasi provider: https://www.nokosnesia.com/docs.

DEWA OTP adalah aplikasi nomor virtual dan penerimaan OTP. Frontend dashboard memakai HTML, CSS, serta Vanilla JavaScript; backend memakai Next.js Route Handler, Supabase PostgreSQL, dan API Nokosnesia REST API v1. Sonny AI terhubung melalui OpenRouter.

## Fitur inti

- Login email/password, registrasi dengan reCAPTCHA v2, dan Google OAuth.
- Dashboard, wallet internal, pembelian nomor, status OTP, refund, riwayat, pengaturan akun, dan Sonny AI.
- Katalog negara, layanan, operator, stok, dan harga live dari Nokosnesia.
- Harga jual DEWA dihitung dari harga `nokosnesia_price_idr` ditambah margin `PRICE_MARKUP_PERCENT`.
- Produk dan harga diperiksa kembali di server sebelum saldo pengguna dipotong; browser hanya menerima harga jual, bukan harga modal provider.
- Pemesanan menggunakan idempotency key; order eksternal dengan status ambigu tidak di-refund otomatis.
- Polling OTP tiap 6 detik sebagai fallback ketika webhook tidak masuk.
- Supabase RLS, cookie HttpOnly, atomic wallet ledger, dan refund idempotent.
- UI Liquid Glass dibuat dengan blur ringan, transparansi, dan animasi transform/opacity; `prefers-reduced-motion` dihormati.

## Domain dan URL

Domain kanonis: `https://dewaotp.my.id`.

- Landing page: `/`
- Dashboard UI: `/dashboard` (rewrite internal ke berkas statis `public/index.html`).
- `/index.html` dan `/index` diarahkan permanen ke `/dashboard`; nama file tidak ditampilkan sebagai URL utama.
- Alias stylesheet dan JavaScript dashboard: `/interface` dan `/portal`.
- Alias ini hanya merapikan URL browser; source frontend tetap dapat dilihat di Developer Tools.

Tambahkan domain `dewaotp.my.id` pada Vercel, ikuti DNS yang ditampilkan Vercel, dan set `NEXT_PUBLIC_SITE_URL=https://dewaotp.my.id`. Pada Supabase Auth, gunakan Site URL yang sama serta redirect URL `/auth/callback`. Tambahkan hostname pada Google reCAPTCHA.

## Setup Nokosnesia

API key dibuat dari Nokosnesia Dashboard → API Keys. API Key diawali `nokosnesia_` dan hanya boleh disimpan pada environment server.

Base URL resmi:

`https://nokosnesia.com/api/v1`

Autentikasi request dilakukan memakai:

`Authorization: Bearer NOKOSNESIA_API_KEY`

Katalog yang diintegrasikan:

| Kebutuhan | Endpoint Nokosnesia |
|---|---|
| Daftar negara | `GET /catalog/countries` |
| Daftar layanan | `GET /catalog/services?country_id=...` |
| Daftar operator | `GET /catalog/operators?country_id=...&platform_id=...` |
| Stok dan harga | `GET /catalog/products?country_id=...&platform_id=...` |
| Buat order | `POST /orders/create` |
| Status/OTP | `GET /orders/:id` |
| Batalkan order | `POST /orders/:id/cancel` |
| Selesaikan order | `POST /orders/:id/finish` |
| Kirim ulang SMS | `POST /orders/:id/resend` |

Website tidak menerima harga atau stok dari browser sebagai sumber kebenaran. Server meminta ulang katalog produk, memeriksa stok/harga, lalu membuat order dengan `catalog_product_id`, `country_id`, `platform_id`, dan optional `operator_id`. Harga jual DEWA dikunci saat reservasi wallet.

Atur di Vercel → Project → Settings → Environment Variables:

- `NOKOSNESIA_API_KEY`: API Key dari Nokosnesia.
- `NOKOSNESIA_BASE_URL`: `https://nokosnesia.com/api/v1`.
- `PRICE_MARKUP_PERCENT`: margin jual (contoh `20` berarti tambah 20% dari harga Nokosnesia).

Setelah mengubah environment variables, lakukan redeploy. Jangan pernah menaruh API Key di `NEXT_PUBLIC_*`, `public/`, HTML, JavaScript browser, atau repository.

### Webhook OTP Nokosnesia

Callback DEWA OTP:

`POST https://dewaotp.my.id/api/webhooks/nokosnesia`

Handler memverifikasi header `x-nokosnesia-signature` dengan HMAC-SHA256 terhadap raw request body. Header diharapkan berformat `sha256=<hex_digest>`.

1. Gunakan Webhook Secret yang ditetapkan atau diberikan oleh Nokosnesia untuk endpoint callback. Dokumentasi publik menjelaskan format HMAC dan header signature, tetapi tidak merinci alur pembuatan secret di panel akun; bila kolom/menu secret tidak tersedia, minta konfirmasi secret serta aktivasi webhook kepada support Nokosnesia.
2. Simpan secret yang sama pada Vercel sebagai `NOKOSNESIA_WEBHOOK_SECRET` untuk Production.
3. Daftarkan URL callback di atas pada dashboard Nokosnesia dan aktifkan event `order.otp_received` serta `order.cancelled`.
4. Redeploy setelah menyimpan environment variable.
5. Kirim test callback dari dashboard jika tersedia; verifikasi respons HTTP 200 dan status order.

Jangan menaruh secret pada query URL. Jangan menggunakan format webhook Nokos.co.id/Nokos.id yang berbeda. Jika Nokosnesia mengubah format payload atau signature, sesuaikan handler dengan dokumentasi yang aktif dan lakukan test signature sebelum produksi.

Event `deposit.completed` dari akun Nokosnesia tidak mengkreditkan wallet pengguna DEWA OTP. Deposit bisnis Nokosnesia dan wallet pengguna DEWA adalah dua saldo yang berbeda.

## Setup Supabase

1. Buat project Supabase.
2. Jalankan seluruh `sql/schema.sql` pada Supabase SQL Editor. File ini juga menambahkan kolom provider Nokosnesia dan memperbolehkan nilai provider `nokosnesia` pada kolom server/order.
3. Isi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` di environment server. Service Role Key tidak boleh dikirim ke browser.
4. Aktifkan email confirmation dan konfigurasi SMTP produksi.
5. Atur Google OAuth pada Supabase jika fitur login Google dipakai.
6. Set `RECAPTCHA_SITE_KEY` dan `RECAPTCHA_SECRET_KEY`. Nama variabel tidak memakai prefix framework; Site Key tetap dikirim ke browser hanya melalui endpoint konfigurasi publik.

## Deposit dan DOKU

Endpoint `/api/payments` masih fail-closed (HTTP 503). Integrasi DOKU tidak boleh dianggap aktif atau digunakan untuk menerima dana sebelum kredensial merchant, signature, status pembayaran, nominal, referensi order, dan idempotency diverifikasi. Endpoint deposit Nokosnesia tidak otomatis menjadi deposit wallet DEWA OTP.

## Sonny AI

Isi `OPENROUTER_API_KEY` dan `OPENROUTER_MODEL`. Key hanya dibaca server. Jawaban Sonny disalurkan melalui streaming response.

## Jalankan lokal

Persyaratan: Node.js 22+, npm, dan project Supabase.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Buka `http://localhost:3000`. Dashboard dapat dibuka di `http://localhost:3000/dashboard`.

## API DEWA OTP

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/config` | Konfigurasi publik non-rahasia |
| POST | `/api/auth/register` | Registrasi + reCAPTCHA |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Sesi aktif dan saldo |
| GET | `/api/catalog` | Negara dan layanan |
| GET | `/api/catalog/operators` | Operator untuk negara + platform |
| GET | `/api/catalog/products` | Produk/stok/harga |
| GET | `/api/catalog/quote` | Quote terpilih dan operator |
| POST | `/api/orders` | Reservasi saldo dan buat nomor |
| GET | `/api/orders/:id/otp` | Status OTP |
| POST | `/api/orders/:id/refund` | Batalkan order dan refund wallet internal |
| POST | `/api/orders/:id/resend` | Minta SMS ulang |
| POST | `/api/webhooks/nokosnesia` | Callback terverifikasi HMAC-SHA256 |
| GET | `/api/history` | Riwayat akun |
| POST | `/api/payments` | DOKU belum diaktifkan |
| POST | `/api/sonny` | Sonny AI streaming |

## Pemeriksaan sebelum produksi

- Pastikan API Key dan webhook secret berada pada environment Vercel yang benar.
- Jalankan SQL schema/migration di Supabase sebelum deploy versi ini.
- Uji katalog untuk beberapa negara, layanan, operator, dan kondisi stok kosong.
- Uji create order, OTP polling, event webhook berulang, pembatalan sebelum OTP, pembatalan setelah OTP, timeout provider, dan retry idempotency.
- Pastikan domain dashboard `/dashboard` terarah benar dan `/index.html` melakukan redirect.
- Lengkapi DOKU, rate limiting terdistribusi, monitoring, backup database, kebijakan privasi, dan syarat layanan sebelum produksi.

## Struktur proyek

```text
dewa-otp/
├── app/
│   ├── api/[...path]/route.js       # Single API entrypoint
│   ├── api/**/handler.js            # Handler modular per fitur
│   ├── auth/callback/route.js
│   ├── marketing.css                # Styling landing page
│   ├── layout.js
│   └── page.js
├── components/marketing/            # Komponen landing page modular per bagian
├── lib/                              # Supabase, Nokosnesia, HTTP, security
├── public/
│   ├── _ui-core-91c2.css
│   ├── _client-4f82.js
│   └── index.html                    # Dashboard static UI; route publik /dashboard
├── sql/schema.sql
├── .env.example
└── README.md
```

Folder root proyek adalah `dewa-otp`.

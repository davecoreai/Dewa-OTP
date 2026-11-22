# Changelog

## v8 — Nokosnesia + Liquid Glass

- Mengganti integrasi provider menjadi Nokosnesia REST API v1.
- Menambahkan katalog negara, layanan, operator, dan quote stok/harga live.
- Menghitung harga jual dengan `PRICE_MARKUP_PERCENT`; harga modal provider tidak dikirim ke browser.
- Menambahkan validasi harga server-side dan pengunci dispatch idempotent agar satu request hanya membuat satu order provider.
- Menambahkan pembelian, status OTP, resend, cancel/refund, finish, dan webhook HMAC-SHA256 Nokosnesia.
- Menambahkan migrasi kolom provider produk/platform dan timestamp dispatch di `sql/schema.sql`.
- Membuat landing page lebih ringkas, tipografi lebih kecil, dan komponen marketing modular.
- Mengurangi permintaan font eksternal dan membatasi blur Liquid Glass agar lebih ringan.
- Mempertahankan route dashboard `/dashboard` serta alias aset `/interface` dan `/portal`.

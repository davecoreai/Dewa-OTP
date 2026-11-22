const features = [
  ['Nomor virtual', 'Pilih layanan dan negara dari katalog provider yang tersedia saat pemesanan.'],
  ['Status OTP', 'Pantau status nomor dan kode OTP dari halaman pesanan.'],
  ['Saldo dan riwayat', 'Lihat saldo akun serta riwayat pesanan dalam satu dashboard.'],
  ['Katalog live', 'Stok, operator, dan harga diperbarui dari API Nokosnesia.']
];

export default function FeatureSection() {
  return <section className="marketing-section" id="fitur">
    <div className="section-heading"><p className="marketing-eyebrow">FITUR PLATFORM</p><h2>Informasi penting<br />dalam satu tempat.</h2><p>Alur penggunaan disusun agar pilihan layanan dan aktivitas akun mudah dipantau.</p></div>
    <div className="feature-grid">{features.map(([title, description], index) => <article className="feature-card" key={title}><span className="feature-index">0{index + 1}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
  </section>;
}

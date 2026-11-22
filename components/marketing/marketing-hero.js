import Link from 'next/link';

export default function MarketingHero() {
  return <section className="marketing-hero">
    <div className="hero-copy">
      <p className="marketing-eyebrow">PLATFORM NOMOR VIRTUAL</p>
      <h1>Kelola pesanan OTP<br /><span>dalam satu dashboard.</span></h1>
      <p className="hero-description">Pilih layanan, negara, dan operator. Pantau stok, harga, nomor, serta status verifikasi melalui satu antarmuka.</p>
      <div className="hero-actions"><Link className="primary-cta" href="/dashboard">Buka DEWA OTP <span aria-hidden="true">→</span></Link><a className="secondary-cta" href="#cara-kerja">Pelajari cara kerja</a></div>
      <p className="hero-note">Harga dan ketersediaan mengikuti katalog Nokosnesia saat data diperbarui.</p>
    </div>
    <div className="hero-visual" aria-hidden="true">
      <div className="visual-orb" />
      <div className="dashboard-card">
        <div className="mini-top"><span>DEWA OTP</span><span className="online-dot"><i /> Katalog terhubung</span></div>
        <div className="mini-label">PESANAN OTP</div><div className="mini-number">+62 ••• ••• •••</div>
        <div className="mini-status"><i /> Menunggu kode</div>
        <div className="mini-code">{Array.from({ length: 6 }, (_, index) => <span key={index}>—</span>)}</div>
        <div className="mini-footer"><span>Status pesanan</span><b>Menunggu OTP</b></div>
      </div>
      <div className="floating-chip chip-a"><i className="fa-solid fa-check" /> Riwayat tersimpan</div>
      <div className="floating-chip chip-b"><i className="fa-solid fa-signal" /> Status pesanan</div>
    </div>
  </section>;
}

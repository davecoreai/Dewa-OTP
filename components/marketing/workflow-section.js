const steps = [
  ['Masuk atau buat akun', 'Gunakan akun DEWA OTP untuk membuka dashboard.'],
  ['Pilih layanan dan negara', 'Pilih operator, lalu tinjau stok dan harga live.'],
  ['Pantau pesanan', 'Gunakan halaman pesanan untuk melihat nomor dan OTP.']
];

export default function WorkflowSection() {
  return <section className="how-section" id="cara-kerja"><div><p className="marketing-eyebrow">CARA KERJA</p><h2>Mulai dari dashboard.</h2></div><ol>{steps.map(([title, description], index) => <li key={title}><span className="step-index">0{index + 1}</span><div><b>{title}</b><small>{description}</small></div></li>)}</ol></section>;
}

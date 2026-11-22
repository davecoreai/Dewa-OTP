import Link from 'next/link';

export default function MarketingCTA() {
  return <section className="marketing-cta"><div><p className="marketing-eyebrow">DEWA OTP</p><h2>Nomor virtual dan<br />pesanan OTP.</h2></div><Link className="primary-cta" href="/dashboard">Masuk ke dashboard <span aria-hidden="true">→</span></Link></section>;
}

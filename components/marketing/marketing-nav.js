import Link from 'next/link';
import Brand from './brand';

export default function MarketingNav() {
  return <header className="marketing-nav"><Brand /><nav aria-label="Navigasi utama"><a href="#fitur">Fitur</a><a href="#cara-kerja">Cara kerja</a><Link className="nav-login" href="/dashboard">Masuk dashboard <span aria-hidden="true">↗</span></Link></nav></header>;
}

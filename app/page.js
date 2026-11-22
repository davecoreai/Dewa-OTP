import { redirect } from 'next/navigation';

// UI utama adalah HTML + CSS + Vanilla JavaScript di public/index.html.
export default function HomePage() {
  redirect('/index.html');
}

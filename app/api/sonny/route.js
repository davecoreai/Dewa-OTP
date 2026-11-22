import { json, error, readJson } from '../../../lib/http';
import { requireUser } from '../../../lib/supabase';

export async function POST(request) {
  const { user } = await requireUser();
  if (!user) return error('Login diperlukan.', 401);
  const body = await readJson(request);
  const message = String(body?.message || '').trim();
  if (!message || message.length > 2000) return error('Pesan harus diisi dan maksimal 2.000 karakter.');
  if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_MODEL) return error('Sonny AI belum dikonfigurasi administrator.', 503);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'DEWA OTP Sonny'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: 'Kamu adalah Sonny, asisten bantuan DEWA OTP. Jawab dalam Bahasa Indonesia, fokus hanya pada penggunaan DEWA OTP, pembelian nomor, deposit, status pesanan, OTP, refund, dan bantuan teknis. Jangan mengklaim dapat melihat atau mengubah data akun/transaksi. Jangan meminta password, OTP login, API key, atau data rahasia. Jelaskan bahwa refund hanya 100% bila provider mengonfirmasi aktivasi dapat dibatalkan sebelum OTP diterima.' },
          { role: 'user', content: message }
        ],
        temperature: 0.4,
        max_tokens: 500
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return error(data?.error?.message || 'Sonny sedang tidak tersedia.', 502);
    return json({ success: true, reply: data?.choices?.[0]?.message?.content || 'Maaf, Sonny belum mendapat jawaban.' });
  } catch (err) { return error(err.message || 'Sonny tidak dapat dihubungi.', 502); }
}

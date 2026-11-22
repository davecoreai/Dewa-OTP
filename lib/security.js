export async function verifyRecaptcha(token, remoteIp, expectedHostname) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret || !token) {
    return { ok: false, reason: !secret ? 'reCAPTCHA belum dikonfigurasi oleh administrator.' : 'Selesaikan verifikasi reCAPTCHA.' };
  }
  try {
    const body = new URLSearchParams({ secret, response: String(token) });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return { ok: false, reason: 'Layanan verifikasi Google tidak tersedia. Coba kembali.' };
    const data = await res.json().catch(() => ({}));
    const receivedHost = String(data.hostname || '').toLowerCase().replace(/\.$/, '');
    const expectedHost = String(expectedHostname || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    const hostnameValid = Boolean(receivedHost && expectedHost && receivedHost === expectedHost);
    return {
      ok: Boolean(data.success && hostnameValid),
      reason: data.success ? 'Domain reCAPTCHA tidak cocok.' : 'Verifikasi reCAPTCHA gagal.'
    };
  } catch {
    return { ok: false, reason: 'Tidak dapat menghubungi layanan reCAPTCHA. Coba kembali.' };
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyNokosnesiaWebhookSignature(rawBody, suppliedSignature, secret) {
  if (typeof rawBody !== 'string' || !suppliedSignature || !secret) return false;
  const header = String(suppliedSignature).trim();
  if (!/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const normalized = header.slice(7).toLowerCase();
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const supplied = Buffer.from(normalized, 'hex');
  const actual = Buffer.from(expected, 'hex');
  return supplied.length === actual.length && timingSafeEqual(supplied, actual);
}

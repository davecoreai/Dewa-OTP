import { NextResponse } from 'next/server';

export function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}

export function error(message, status = 400, code = 'REQUEST_ERROR') {
  return json({ success: false, error: message, code }, status);
}

export async function readJson(request) {
  try { return await request.json(); }
  catch { return null; }
}

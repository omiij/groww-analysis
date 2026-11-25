/**
 * Vercel serverless proxy for Yahoo Finance chart data.
 *
 * In development, vite.config.ts proxies /yahoo-api to Yahoo. A static Vercel
 * deployment has no such proxy, so vercel.json rewrites /yahoo-api/* to this
 * function. It only forwards the public chart endpoint, so it is not an open proxy.
 * No secrets are involved (Yahoo chart data needs no key).
 */
const UPSTREAM = 'https://query1.finance.yahoo.com';
const ALLOWED_PREFIX = 'v8/finance/chart/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const raw = req.query?.path;
  const path = (Array.isArray(raw) ? raw.join('/') : raw ?? '').replace(/^\/+/, '');

  if (!path.startsWith(ALLOWED_PREFIX) || path.includes('..')) {
    res.status(400).json({ error: 'Only Yahoo chart requests are supported.' });
    return;
  }

  // Forward the original query string (period1, period2, interval, ...) minus our routing param.
  url.searchParams.delete('path');
  const target = `${UPSTREAM}/${path}?${url.searchParams.toString()}`;

  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    // Cache briefly at the edge so repeat requests don't hammer Yahoo.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.send(body);
  } catch (err) {
    res.status(502).json({ error: `Could not reach Yahoo Finance: ${String(err)}` });
  }
}

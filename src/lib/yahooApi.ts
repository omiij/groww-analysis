/**
 * Free historical candles from Yahoo Finance (the same data yfinance uses).
 * Requests go through the Vite dev proxy at `/yahoo-api`, which adds a
 * browser User-Agent and avoids CORS. No API key needed.
 */
import type { Candle } from './growwApi';

const API_BASE = '/yahoo-api';

/** Interval options (minutes) Yahoo supports, with its interval codes. */
export const YAHOO_INTERVALS: { label: string; value: number; code: string }[] = [
  { label: '5 min (last 60 days)', value: 5, code: '5m' },
  { label: '15 min (last 60 days)', value: 15, code: '15m' },
  { label: '1 hour (last 730 days)', value: 60, code: '60m' },
  { label: '1 day', value: 1440, code: '1d' },
  { label: '1 week', value: 10080, code: '1wk' },
];

/** Indian indices available from Yahoo. `symbol` is the Groww-style name, `yahoo` the Yahoo code. */
export const INDICES: { symbol: string; label: string; yahoo: string; exchange: 'NSE' | 'BSE' }[] =
  [
    { symbol: 'NIFTY', label: 'NIFTY 50', yahoo: '^NSEI', exchange: 'NSE' },
    { symbol: 'BANKNIFTY', label: 'NIFTY BANK', yahoo: '^NSEBANK', exchange: 'NSE' },
    {
      symbol: 'FINNIFTY',
      label: 'NIFTY FIN SERVICE',
      yahoo: 'NIFTY_FIN_SERVICE.NS',
      exchange: 'NSE',
    },
    {
      symbol: 'MIDCPNIFTY',
      label: 'NIFTY MIDCAP SELECT',
      yahoo: 'NIFTY_MID_SELECT.NS',
      exchange: 'NSE',
    },
    { symbol: 'NIFTYNXT50', label: 'NIFTY NEXT 50', yahoo: '^NSMIDCP', exchange: 'NSE' },
    { symbol: 'NIFTYIT', label: 'NIFTY IT', yahoo: '^CNXIT', exchange: 'NSE' },
    { symbol: 'NIFTYAUTO', label: 'NIFTY AUTO', yahoo: '^CNXAUTO', exchange: 'NSE' },
    { symbol: 'NIFTYPHARMA', label: 'NIFTY PHARMA', yahoo: '^CNXPHARMA', exchange: 'NSE' },
    { symbol: 'NIFTYFMCG', label: 'NIFTY FMCG', yahoo: '^CNXFMCG', exchange: 'NSE' },
    { symbol: 'NIFTYMETAL', label: 'NIFTY METAL', yahoo: '^CNXMETAL', exchange: 'NSE' },
    { symbol: 'INDIAVIX', label: 'INDIA VIX', yahoo: '^INDIAVIX', exchange: 'NSE' },
    { symbol: 'SENSEX', label: 'BSE SENSEX', yahoo: '^BSESN', exchange: 'BSE' },
  ];

/** Indian indices use special Yahoo codes instead of a .NS / .BO suffix. */
export const YAHOO_INDEX_ALIASES: Record<string, string> = {
  ...Object.fromEntries(INDICES.map((x) => [x.symbol, x.yahoo])),
  ...Object.fromEntries(INDICES.map((x) => [x.label.replace(/\s+/g, ''), x.yahoo])),
  NIFTY50: '^NSEI',
};

/** Map a Groww-style symbol to a Yahoo ticker. Leaves symbols with a suffix or ^ untouched. */
export function toYahooSymbol(symbol: string, exchange: 'NSE' | 'BSE'): string {
  const s = symbol.trim().toUpperCase();
  const alias = YAHOO_INDEX_ALIASES[s] ?? YAHOO_INDEX_ALIASES[s.replace(/\s+/g, '')];
  if (alias) return alias;
  if (s.startsWith('^') || s.includes('.') || s.includes('=')) return s;
  return `${s}${exchange === 'BSE' ? '.BO' : '.NS'}`;
}

interface YahooChart {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
      };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

export async function getYahooCandles(params: {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  intervalInMinutes: number;
  start: Date;
  end: Date;
}): Promise<Candle[]> {
  const code = YAHOO_INTERVALS.find((i) => i.value === params.intervalInMinutes)?.code;
  if (!code) throw new Error('This interval is not available from Yahoo Finance.');

  const ticker = toYahooSymbol(params.symbol, params.exchange);
  const q = new URLSearchParams({
    period1: String(Math.floor(params.start.getTime() / 1000)),
    period2: String(Math.floor(params.end.getTime() / 1000)),
    interval: code,
    events: 'history',
  });
  const url = `${API_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?${q.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error(
      `Network error calling Yahoo Finance. Is the dev server running? (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  let json: YahooChart | null = null;
  try {
    json = (await res.json()) as YahooChart;
  } catch {
    /* handled below */
  }
  const apiErr = json?.chart?.error;
  if (!res.ok || apiErr) {
    throw new Error(
      `Yahoo Finance: ${apiErr?.description ?? `request failed (${res.status})`} (ticker ${ticker})`
    );
  }

  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const qd = r?.indicators?.quote?.[0];
  if (!qd) return [];

  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = qd.open?.[i];
    const h = qd.high?.[i];
    const l = qd.low?.[i];
    const c = qd.close?.[i];
    if (o == null || h == null || l == null || c == null) continue; // skip gaps
    out.push({
      timestamp: ts[i],
      date: new Date(ts[i] * 1000),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: qd.volume?.[i] ?? 0,
    });
  }
  return out;
}

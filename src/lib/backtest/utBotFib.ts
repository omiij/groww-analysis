/**
 * Port of the "UT Bot + Fib Band Scalper (1 Direction Per Day)" Pine Script.
 * Produces per-bar BUY / SELL signals (evaluated on the bar's close).
 */
import type { Candle } from '../growwApi';
import { atr, sma, stddev } from './indicators';

export interface UtBotFibParams {
  /** UT Bot sensitivity ("key value"). Lower = faster. */
  sensitivity: number;
  /** ATR period. */
  atrPeriod: number;
  /** Band basis / stdev length. */
  bandLength: number;
  /** Band width in standard deviations (Fib 2.618). */
  bandMult: number;
  /** Allow only the first signal's direction for the rest of each day. */
  dailyLock: boolean;
}

export const DEFAULT_UTBOT_FIB: UtBotFibParams = {
  sensitivity: 0.5,
  atrPeriod: 10,
  bandLength: 20,
  bandMult: 2.618,
  dailyLock: true,
};

export interface Signals {
  buy: boolean[];
  sell: boolean[];
  /** Chart helpers. */
  upper: number[];
  lower: number[];
  trail: number[];
}

/** IST calendar-day key for a candle (NSE sessions are in IST). */
const dayKey = (c: Candle): number => Math.floor((c.timestamp + 19800) / 86400);

export function utBotFibSignals(candles: Candle[], p: UtBotFibParams): Signals {
  const n = candles.length;
  const close = candles.map((c) => c.close);
  const basis = sma(close, p.bandLength);
  const dev = stddev(close, p.bandLength);
  const upper = basis.map((b, i) => b + dev[i] * p.bandMult);
  const lower = basis.map((b, i) => b - dev[i] * p.bandMult);
  const xatr = atr(candles, Math.max(1, Math.floor(p.atrPeriod)));

  // UT Bot ATR trailing stop (src = close, ema(src, 1) == src).
  const trail = new Array<number>(n).fill(NaN);
  const rawBuy = new Array<boolean>(n).fill(false);
  const rawSell = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const nLoss = p.sensitivity * xatr[i];
    if (Number.isNaN(nLoss)) continue;
    const s = close[i];
    const prevStop = i > 0 ? trail[i - 1] : NaN;
    const prevSrc = i > 0 ? close[i - 1] : NaN;
    let stop: number;
    if (Number.isNaN(prevStop)) stop = s - nLoss;
    else if (s > prevStop && prevSrc > prevStop) stop = Math.max(prevStop, s - nLoss);
    else if (s < prevStop && prevSrc < prevStop) stop = Math.min(prevStop, s + nLoss);
    else stop = s > prevStop ? s - nLoss : s + nLoss;
    trail[i] = stop;
    if (!Number.isNaN(prevStop)) {
      rawBuy[i] = s > stop && prevSrc <= prevStop;
      rawSell[i] = s < stop && prevSrc >= prevStop;
    }
  }

  // Confluence: a band touch arms the side; the UT Bot flip then fires it.
  const buy = new Array<boolean>(n).fill(false);
  const sell = new Array<boolean>(n).fill(false);
  let pendingBuy = false;
  let pendingSell = false;
  let lockDay = NaN;
  let dayDirection = 0;
  for (let i = 0; i < n; i++) {
    if (candles[i].low <= lower[i]) pendingBuy = true;
    if (candles[i].high >= upper[i]) pendingSell = true;
    if (rawBuy[i]) pendingSell = false;
    if (rawSell[i]) pendingBuy = false;
    const baseBuy = rawBuy[i] && pendingBuy;
    const baseSell = rawSell[i] && pendingSell;

    if (!p.dailyLock) {
      buy[i] = baseBuy;
      sell[i] = baseSell;
      continue;
    }
    const d = dayKey(candles[i]);
    if (d !== lockDay) {
      lockDay = d;
      dayDirection = 0;
    }
    if (dayDirection === 0) {
      if (baseBuy) dayDirection = 1;
      else if (baseSell) dayDirection = -1;
    }
    buy[i] = baseBuy && dayDirection === 1;
    sell[i] = baseSell && dayDirection === -1;
  }

  return { buy, sell, upper, lower, trail };
}

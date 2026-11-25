/**
 * Indicator library (TypeScript port of the core backtrader indicators).
 * Every function returns an array aligned to the input bars; values are NaN
 * until enough bars exist (backtrader's "minimum period").
 */
import type { Candle } from '../growwApi';

export type Series = number[];

const nan = (n: number): Series => new Array<number>(n).fill(NaN);

export function sma(values: Series, period: number): Series {
  const out = nan(values.length);
  let sum = 0;
  let count = 0; // valid values in window
  for (let i = 0; i < values.length; i++) {
    if (!Number.isNaN(values[i])) {
      sum += values[i];
      count++;
    }
    if (i >= period && !Number.isNaN(values[i - period])) {
      sum -= values[i - period];
      count--;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

export function ema(values: Series, period: number): Series {
  const out = nan(values.length);
  const k = 2 / (period + 1);
  let prev = NaN;
  let seed = 0;
  let seen = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    if (Number.isNaN(prev)) {
      seed += v;
      seen++;
      if (seen === period) {
        prev = seed / period;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder's RSI, same smoothing as backtrader's RSI (SMMA). */
export function rsi(values: Series, period: number): Series {
  const out = nan(values.length);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

export function stddev(values: Series, period: number): Series {
  const mean = sma(values, period);
  const out = nan(values.length);
  for (let i = period - 1; i < values.length; i++) {
    if (Number.isNaN(mean[i])) continue;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - mean[i]) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

export function atr(candles: Candle[], period: number): Series {
  const tr = candles.map((c, i) =>
    i === 0
      ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close))
  );
  const out = nan(candles.length);
  let prev = NaN;
  for (let i = 0; i < tr.length; i++) {
    if (i === period - 1) {
      prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out[i] = prev;
    } else if (i >= period) {
      prev = (prev * (period - 1) + tr[i]) / period;
      out[i] = prev;
    }
  }
  return out;
}

export function highest(values: Series, period: number): Series {
  const out = nan(values.length);
  for (let i = period - 1; i < values.length; i++) {
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, values[j]);
    out[i] = m;
  }
  return out;
}

export function lowest(values: Series, period: number): Series {
  const out = nan(values.length);
  for (let i = period - 1; i < values.length; i++) {
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, values[j]);
    out[i] = m;
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  hist: Series;
}

export function macd(values: Series, fast = 12, slow = 26, signalP = 9): MacdResult {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => f[i] - s[i]); // NaN propagates
  const signal = ema(line, signalP);
  const hist = line.map((v, i) => v - signal[i]);
  return { macd: line, signal, hist };
}

export interface BollingerResult {
  mid: Series;
  upper: Series;
  lower: Series;
}

export function bollinger(values: Series, period: number, devs = 2): BollingerResult {
  const mid = sma(values, period);
  const sd = stddev(values, period);
  return {
    mid,
    upper: mid.map((m, i) => m + devs * sd[i]),
    lower: mid.map((m, i) => m - devs * sd[i]),
  };
}

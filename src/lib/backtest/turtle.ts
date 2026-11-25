/**
 * Turtle Trading (Richard Dennis / William Eckhardt, 1983) breakout signals.
 *
 *  - Entry: close breaks above the highest high of the previous `entryLength` bars (long)
 *    or below the lowest low (short). System 1 = 20, System 2 = 55.
 *  - Exit: close breaks the opposite `exitLength`-bar channel. System 1 = 10, System 2 = 20.
 *
 * Position sizing in N units, pyramiding every 0.5N and the 2N stop are handled by the
 * engine's pyramid settings (N = ATR(20)).
 */
import type { Candle } from '../growwApi';

export interface TurtleParams {
  entryLength: number;
  exitLength: number;
}

export const TURTLE_SYSTEM_1: TurtleParams = { entryLength: 20, exitLength: 10 };
export const TURTLE_SYSTEM_2: TurtleParams = { entryLength: 55, exitLength: 20 };

/** Highest high / lowest low of the `len` bars before bar i (excludes bar i). */
function channel(candles: Candle[], len: number) {
  const n = candles.length;
  const hi = new Array<number>(n).fill(NaN);
  const lo = new Array<number>(n).fill(NaN);
  for (let i = len; i < n; i++) {
    let h = -Infinity;
    let l = Infinity;
    for (let j = i - len; j < i; j++) {
      if (candles[j].high > h) h = candles[j].high;
      if (candles[j].low < l) l = candles[j].low;
    }
    hi[i] = h;
    lo[i] = l;
  }
  return { hi, lo };
}

export function turtleSignals(candles: Candle[], p: TurtleParams) {
  const entryLen = Math.max(2, Math.floor(p.entryLength));
  const exitLen = Math.max(2, Math.floor(p.exitLength));
  const ent = channel(candles, entryLen);
  const ext = channel(candles, exitLen);
  const n = candles.length;
  const buy = new Array<boolean>(n).fill(false);
  const sell = new Array<boolean>(n).fill(false);
  const exitLong = new Array<boolean>(n).fill(false);
  const exitShort = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const c = candles[i].close;
    if (!Number.isNaN(ent.hi[i])) {
      buy[i] = c > ent.hi[i];
      sell[i] = c < ent.lo[i];
    }
    if (!Number.isNaN(ext.lo[i])) {
      exitLong[i] = c < ext.lo[i];
      exitShort[i] = c > ext.hi[i];
    }
  }
  return { buy, sell, exitLong, exitShort, entryHigh: ent.hi, entryLow: ent.lo };
}

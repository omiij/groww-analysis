/**
 * Port of the Pine v4 "UT Bot Alerts (EMA Proximity & Trend Filter)" study.
 * BUY: UT Bot flips up while price is above the filter EMA and within X% of it.
 * SELL: UT Bot flips down while price is below the filter EMA and within X% of it.
 * Optional trend filter: BUY only while the filter EMA is rising, SELL only while it is falling.
 */
import type { Candle } from '../growwApi';
import { atr, ema } from './indicators';

export interface UtBotEmaParams {
  /** Key value (sensitivity). */
  sensitivity: number;
  atrPeriod: number;
  /** Filter EMA length. */
  emaLength: number;
  /** Max % distance of price from the filter EMA for a signal to be allowed. */
  pctThreshold: number;
  /** Use Heikin Ashi close as the source. */
  heikinAshi: boolean;
  /**
   * Only take trades in the direction of the trend: BUY needs the filter EMA rising,
   * SELL needs it falling. Missing (older saved strategies) counts as off.
   */
  trendFilter: boolean;
  /** Bars back to compare the EMA against when judging its slope. */
  trendLookback: number;
}

export const DEFAULT_UTBOT_EMA: UtBotEmaParams = {
  sensitivity: 1,
  atrPeriod: 10,
  emaLength: 50,
  pctThreshold: 0.5,
  heikinAshi: false,
  trendFilter: true,
  trendLookback: 5,
};

export function utBotEmaSignals(
  candles: Candle[],
  p: UtBotEmaParams
): { buy: boolean[]; sell: boolean[] } {
  const n = candles.length;
  // Heikin Ashi close is (O+H+L+C)/4.
  const src = candles.map((c) =>
    p.heikinAshi ? (c.open + c.high + c.low + c.close) / 4 : c.close
  );
  const xatr = atr(candles, Math.max(1, Math.floor(p.atrPeriod)));
  const filter = ema(src, Math.max(1, Math.floor(p.emaLength)));

  const lookback = Math.max(1, Math.floor(p.trendLookback ?? 5));
  const nz = (v: number) => (Number.isNaN(v) ? 0 : v);
  const stop = new Array<number>(n).fill(NaN);
  const buy = new Array<boolean>(n).fill(false);
  const sell = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    const nLoss = p.sensitivity * xatr[i];
    const s = src[i];
    const prevStop = i > 0 ? stop[i - 1] : NaN;
    const prevSrc = i > 0 ? src[i - 1] : NaN;
    const ps = nz(prevStop);
    // NaN while ATR is warming up, like Pine's na arithmetic.
    if (s > ps && prevSrc > ps) stop[i] = Math.max(ps, s - nLoss);
    else if (s < ps && prevSrc < ps) stop[i] = Math.min(ps, s + nLoss);
    else stop[i] = s > ps ? s - nLoss : s + nLoss;

    if (i === 0 || Number.isNaN(prevStop) || Number.isNaN(stop[i]) || Number.isNaN(filter[i]))
      continue;

    const above = s > stop[i] && prevSrc <= prevStop; // crossover(src, stop)
    const below = stop[i] > s && prevStop <= prevSrc; // crossover(stop, src)
    const distPct = (Math.abs(s - filter[i]) / filter[i]) * 100;
    const near = distPct <= p.pctThreshold;
    let upTrend = true;
    let downTrend = true;
    if (p.trendFilter === true) {
      const back = filter[i - lookback];
      // No slope yet (EMA still warming up) means no trade, not a free pass.
      upTrend = i >= lookback && !Number.isNaN(back) && filter[i] > back;
      downTrend = i >= lookback && !Number.isNaN(back) && filter[i] < back;
    }
    buy[i] = above && near && s > filter[i] && upTrend;
    sell[i] = below && near && s < filter[i] && downTrend;
  }
  return { buy, sell };
}

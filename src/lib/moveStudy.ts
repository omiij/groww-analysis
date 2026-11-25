/**
 * "Move Study": scores how clean each move was, then tests which conditions
 * (known BEFORE the move started) came before clean moves more often than usual.
 *
 * Two units of study:
 *  - Intraday sessions: each trading day scored from its intraday bars.
 *  - Multi-day swings: each N-day window (open of day i to close of day i+N-1)
 *    scored from daily bars, so it can cover 10+ years.
 *
 * Clean move = efficiency ratio >= erMin AND |net move| >= moveAtrMin x ATR(14)
 *              AND largest pullback against the direction <= pullbackAtrMax x ATR(14).
 */
import type { Candle } from './growwApi';
import { atr, bollinger, ema } from './backtest/indicators';

export type StudyMode = 'intraday' | 'swing';

export interface CleanThresholds {
  /** Efficiency ratio minimum (0..1). */
  erMin: number;
  /** Net move must be at least this many daily ATRs. */
  moveAtrMin: number;
  /** Largest pullback must be at most this many daily ATRs. */
  pullbackAtrMax: number;
}

export const DEFAULT_THRESHOLDS: Record<StudyMode, CleanThresholds> = {
  intraday: { erMin: 0.35, moveAtrMin: 0.8, pullbackAtrMax: 0.4 },
  swing: { erMin: 0.6, moveAtrMin: 1.5, pullbackAtrMax: 0.75 },
};

export interface StudyUnit {
  /** Daily-bar index of the day the move starts. */
  dayIndex: number;
  date: Date;
  /** 1 = up move, -1 = down move. */
  dir: 1 | -1;
  netPct: number;
  er: number;
  moveAtr: number;
  pullbackAtr: number;
  clean: boolean;
  /** Condition keys that were true before the move. */
  conditions: string[];
}

export interface ConditionStat {
  key: string;
  label: string;
  group: string;
  n: number;
  clean: number;
  cleanPct: number;
  /** Percentage points above / below the base rate. */
  liftPts: number;
  cleanUp: number;
  cleanDown: number;
  /** First 70% of the period (where you "find" the edge). */
  inN: number;
  inPct: number;
  /** Last 30% of the period (where you check it still works). */
  outN: number;
  outPct: number;
  /** Lift is in the same direction in both halves and both samples are big enough. */
  holds: boolean;
}

export interface HeatCell {
  weekday: number;
  hour: number;
  n: number;
  cleanPct: number;
  avgDirRatio: number;
}

export interface StudyResult {
  units: StudyUnit[];
  baseN: number;
  baseClean: number;
  basePct: number;
  inBasePct: number;
  outBasePct: number;
  splitDate: Date | null;
  stats: ConditionStat[];
  heatmap: HeatCell[];
}

/* -------------------------------- helpers -------------------------------- */

const IST = 19800;
export const dayKey = (ts: number): number => Math.floor((ts + IST) / 86400);
const istHour = (ts: number): number => Math.floor(((ts + IST) % 86400) / 3600);
/** 0 = Monday ... 4 = Friday (IST). */
const istWeekday = (ts: number): number => (new Date((ts + IST) * 1000).getUTCDay() + 6) % 7;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Wilder's ADX. */
export function adx(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(NaN);
  if (n <= period * 2) return out;
  let trS = 0;
  let pS = 0;
  let mS = 0;
  let adxPrev = NaN;
  let dxSum = 0;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    const up = c.high - p.high;
    const dn = p.low - c.low;
    const pdm = up > dn && up > 0 ? up : 0;
    const mdm = dn > up && dn > 0 ? dn : 0;
    if (i <= period) {
      trS += tr;
      pS += pdm;
      mS += mdm;
      if (i < period) continue;
    } else {
      trS = trS - trS / period + tr;
      pS = pS - pS / period + pdm;
      mS = mS - mS / period + mdm;
    }
    const pdi = trS > 0 ? (100 * pS) / trS : 0;
    const mdi = trS > 0 ? (100 * mS) / trS : 0;
    const dx = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
    if (i < period * 2) {
      dxSum += dx;
    } else if (i === period * 2) {
      dxSum += dx;
      adxPrev = dxSum / (period + 1);
      out[i] = adxPrev;
    } else {
      adxPrev = (adxPrev * (period - 1) + dx) / period;
      out[i] = adxPrev;
    }
  }
  return out;
}

/** Score a price path. `path` starts with the first open, then each bar close. */
function scorePath(path: number[], highs: number[], lows: number[], atrVal: number) {
  const net = path[path.length - 1] - path[0];
  let travel = 0;
  for (let k = 1; k < path.length; k++) travel += Math.abs(path[k] - path[k - 1]);
  const er = travel > 0 ? Math.abs(net) / travel : 0;
  const dir: 1 | -1 = net >= 0 ? 1 : -1;
  // Largest move against the direction, measured from the best price reached so far.
  let best = path[0];
  let pullback = 0;
  for (let k = 0; k < highs.length; k++) {
    if (dir === 1) {
      pullback = Math.max(pullback, best - lows[k]);
      best = Math.max(best, highs[k]);
    } else {
      pullback = Math.max(pullback, highs[k] - best);
      best = Math.min(best, lows[k]);
    }
  }
  return {
    dir,
    netPct: (net / path[0]) * 100,
    er,
    moveAtr: atrVal > 0 ? Math.abs(net) / atrVal : 0,
    pullbackAtr: atrVal > 0 ? pullback / atrVal : 0,
  };
}

/* ------------------------------- conditions ------------------------------- */

interface CondDef {
  key: string;
  label: string;
  group: string;
}

export const CONDITIONS: CondDef[] = [
  {
    key: 'nr7',
    label: 'Previous day was NR7 (narrowest range of 7 days)',
    group: 'Volatility squeeze',
  },
  { key: 'inside', label: 'Previous day was an inside day', group: 'Volatility squeeze' },
  {
    key: 'bbw_low',
    label: 'Bollinger width in lowest 20% of last 120 days',
    group: 'Volatility squeeze',
  },
  { key: 'prev_small', label: 'Previous day range < 0.7 × ATR', group: 'Volatility squeeze' },
  { key: 'prev_big', label: 'Previous day range > 1.5 × ATR', group: 'Volatility expansion' },
  {
    key: 'prev_clean',
    label: 'Previous day was itself a clean move',
    group: 'Volatility expansion',
  },
  { key: 'adx_high', label: 'ADX(14) > 25 (trending)', group: 'Trend' },
  { key: 'adx_low', label: 'ADX(14) < 20 (no trend)', group: 'Trend' },
  { key: 'above_ema50', label: 'Close above 50 EMA', group: 'Trend' },
  { key: 'below_ema50', label: 'Close below 50 EMA', group: 'Trend' },
  { key: 'ema20_up', label: '20 EMA rising (vs 5 days ago)', group: 'Trend' },
  { key: 'ema20_down', label: '20 EMA falling (vs 5 days ago)', group: 'Trend' },
  { key: 'near_ema50', label: 'Close within 1% of 50 EMA', group: 'Trend' },
  { key: 'gap_up', label: 'Gap up > 0.5%', group: 'Opening' },
  { key: 'gap_down', label: 'Gap down > 0.5%', group: 'Opening' },
  { key: 'flat_open', label: 'Flat open (|gap| < 0.2%)', group: 'Opening' },
  {
    key: 'or_break',
    label: 'Price broke the first-30-min range within the next hour',
    group: 'Opening',
  },
  { key: 'vix_high', label: 'INDIA VIX above its 60-day average', group: 'INDIA VIX' },
  { key: 'vix_low', label: 'INDIA VIX below its 60-day average', group: 'INDIA VIX' },
  { key: 'vix_rising', label: 'INDIA VIX rising (vs 5 days ago)', group: 'INDIA VIX' },
  { key: 'vix_falling', label: 'INDIA VIX falling (vs 5 days ago)', group: 'INDIA VIX' },
  ...WEEKDAYS.slice(0, 5).map((d, i) => ({
    key: `wd_${i}`,
    label: `Day is ${d}`,
    group: 'Calendar',
  })),
  { key: 'month_start', label: 'First 3 trading days of the month', group: 'Calendar' },
  { key: 'month_end', label: 'Last 3 trading days of the month', group: 'Calendar' },
];

/** Daily features evaluated with data up to the day before i (plus day i's open). */
function dailyConditions(
  d: Candle[],
  i: number,
  ind: {
    atr14: number[];
    adx14: number[];
    ema20: number[];
    ema50: number[];
    bbw: number[];
    vix: Map<number, number>;
    vixAvg60: Map<number, number>;
    vixPrev5: Map<number, number>;
    prevClean: boolean;
  }
): string[] {
  const out: string[] = [];
  const p = i - 1;
  if (p < 1) return out;
  const prev = d[p];
  const rng = (k: number) => d[k].high - d[k].low;
  const a = ind.atr14[p];

  if (p >= 6) {
    let isMin = true;
    for (let k = p - 6; k < p; k++) if (rng(k) <= rng(p)) isMin = false;
    if (isMin) out.push('nr7');
  }
  if (prev.high < d[p - 1].high && prev.low > d[p - 1].low) out.push('inside');
  if (p >= 120 && !Number.isNaN(ind.bbw[p])) {
    const win = ind.bbw
      .slice(p - 119, p + 1)
      .filter((v) => !Number.isNaN(v))
      .sort((x, y) => x - y);
    if (win.length > 20 && ind.bbw[p] <= win[Math.floor(win.length * 0.2)]) out.push('bbw_low');
  }
  if (!Number.isNaN(a)) {
    if (rng(p) < 0.7 * a) out.push('prev_small');
    if (rng(p) > 1.5 * a) out.push('prev_big');
  }
  if (ind.prevClean) out.push('prev_clean');

  const ax = ind.adx14[p];
  if (!Number.isNaN(ax)) {
    if (ax > 25) out.push('adx_high');
    if (ax < 20) out.push('adx_low');
  }
  const e50 = ind.ema50[p];
  if (!Number.isNaN(e50)) {
    out.push(prev.close > e50 ? 'above_ema50' : 'below_ema50');
    if (Math.abs(prev.close / e50 - 1) <= 0.01) out.push('near_ema50');
  }
  if (p >= 5 && !Number.isNaN(ind.ema20[p]) && !Number.isNaN(ind.ema20[p - 5])) {
    out.push(ind.ema20[p] > ind.ema20[p - 5] ? 'ema20_up' : 'ema20_down');
  }

  const gap = d[i].open / prev.close - 1;
  if (gap > 0.005) out.push('gap_up');
  else if (gap < -0.005) out.push('gap_down');
  if (Math.abs(gap) < 0.002) out.push('flat_open');

  const dk = dayKey(prev.timestamp);
  const v = ind.vix.get(dk);
  const vAvg = ind.vixAvg60.get(dk);
  const vPrev = ind.vixPrev5.get(dk);
  if (v != null && vAvg != null) out.push(v > vAvg ? 'vix_high' : 'vix_low');
  if (v != null && vPrev != null) out.push(v > vPrev ? 'vix_rising' : 'vix_falling');

  const wd = istWeekday(d[i].timestamp);
  if (wd < 5) out.push(`wd_${wd}`);
  const month = (k: number) => new Date((d[k].timestamp + IST) * 1000).getUTCMonth();
  // Trading-day position within the month.
  let fromStart = 0;
  for (let k = i - 1; k >= 0 && month(k) === month(i); k--) fromStart++;
  if (fromStart < 3) out.push('month_start');
  let toEnd = 0;
  for (let k = i + 1; k < d.length && month(k) === month(i); k++) toEnd++;
  if (i + 3 < d.length && toEnd < 3) out.push('month_end');
  return out;
}

/* --------------------------------- runner --------------------------------- */

export interface StudyInput {
  mode: StudyMode;
  /** Daily candles covering the study period plus ~1 year of warm-up before it. */
  daily: Candle[];
  /** Intraday candles (intraday mode only). */
  intraday?: Candle[];
  /** INDIA VIX daily candles (optional). */
  vix?: Candle[];
  /** First day included in the study (earlier daily bars are warm-up only). */
  studyStart: Date;
  /** Swing mode window in trading days. */
  swingDays: number;
  thresholds: CleanThresholds;
}

export function runMoveStudy(inp: StudyInput): StudyResult {
  const d = inp.daily;
  const t = inp.thresholds;
  const closes = d.map((c) => c.close);
  const bb = bollinger(closes, 20);
  const ind = {
    atr14: atr(d, 14),
    adx14: adx(d, 14),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    bbw: bb.mid.map((m, k) => (m > 0 ? (bb.upper[k] - bb.lower[k]) / m : NaN)),
    vix: new Map<number, number>(),
    vixAvg60: new Map<number, number>(),
    vixPrev5: new Map<number, number>(),
    prevClean: false,
  };
  if (inp.vix?.length) {
    const vc = inp.vix.map((c) => c.close);
    for (let k = 0; k < inp.vix.length; k++) {
      const key = dayKey(inp.vix[k].timestamp);
      ind.vix.set(key, vc[k]);
      if (k >= 59) ind.vixAvg60.set(key, vc.slice(k - 59, k + 1).reduce((s, x) => s + x, 0) / 60);
      if (k >= 5) ind.vixPrev5.set(key, vc[k - 5]);
    }
  }

  const startKey = dayKey(Math.floor(inp.studyStart.getTime() / 1000));
  const dayIdx = new Map<number, number>();
  d.forEach((c, k) => dayIdx.set(dayKey(c.timestamp), k));

  const isClean = (s: { er: number; moveAtr: number; pullbackAtr: number }) =>
    s.er >= t.erMin && s.moveAtr >= t.moveAtrMin && s.pullbackAtr <= t.pullbackAtrMax;

  const units: StudyUnit[] = [];
  const heat = new Map<string, { n: number; clean: number; dr: number }>();
  /** Clean flag per daily index, used for the "previous day was clean" condition. */
  const cleanByDay = new Map<number, boolean>();

  if (inp.mode === 'intraday') {
    // Group intraday bars into IST sessions.
    const sessions = new Map<number, Candle[]>();
    for (const c of inp.intraday ?? []) {
      const k = dayKey(c.timestamp);
      if (!sessions.has(k)) sessions.set(k, []);
      sessions.get(k)!.push(c);
    }
    const keys = [...sessions.keys()].sort((x, y) => x - y);
    for (const k of keys) {
      if (k < startKey) continue;
      const bars = sessions.get(k)!;
      const i = dayIdx.get(k);
      if (i == null || i < 1 || bars.length < 3) continue;
      const a = ind.atr14[i - 1];
      if (Number.isNaN(a) || a <= 0) continue;
      const s = scorePath(
        [bars[0].open, ...bars.map((b) => b.close)],
        bars.map((b) => b.high),
        bars.map((b) => b.low),
        a
      );
      const clean = isClean(s);
      ind.prevClean = cleanByDay.get(i - 1) ?? false;
      const conditions = dailyConditions(d, i, ind);

      // Opening-range break: the first 30 min sets the range; did price break it in the next hour?
      const t0 = bars[0].timestamp;
      const orBars = bars.filter((b) => b.timestamp < t0 + 1800);
      const next = bars.filter((b) => b.timestamp >= t0 + 1800 && b.timestamp < t0 + 5400);
      const barSec = bars[1].timestamp - bars[0].timestamp;
      if (barSec <= 900 && orBars.length && next.length && orBars.length < bars.length) {
        const orH = Math.max(...orBars.map((b) => b.high));
        const orL = Math.min(...orBars.map((b) => b.low));
        if (next.some((b) => b.close > orH || b.close < orL)) conditions.push('or_break');
      }

      cleanByDay.set(i, clean);
      units.push({ dayIndex: i, date: d[i].date, ...s, clean, conditions });

      // Hour-by-weekday heatmap: how directional each clock hour was.
      const byHour = new Map<number, Candle[]>();
      for (const b of bars) {
        const h = istHour(b.timestamp);
        if (!byHour.has(h)) byHour.set(h, []);
        byHour.get(h)!.push(b);
      }
      const wd = istWeekday(bars[0].timestamp);
      for (const [h, hb] of byHour) {
        const hi = Math.max(...hb.map((b) => b.high));
        const lo = Math.min(...hb.map((b) => b.low));
        const net = Math.abs(hb[hb.length - 1].close - hb[0].open);
        const dirRatio = hi > lo ? net / (hi - lo) : 0;
        // A clean hour: mostly one-way and at least 0.2 x daily ATR.
        const cleanHour = dirRatio >= 0.6 && net >= 0.2 * a;
        const key = `${wd}-${h}`;
        const cell = heat.get(key) ?? { n: 0, clean: 0, dr: 0 };
        cell.n++;
        cell.dr += dirRatio;
        if (cleanHour) cell.clean++;
        heat.set(key, cell);
      }
    }
  } else {
    const N = Math.max(2, Math.floor(inp.swingDays));
    for (let i = 1; i + N - 1 < d.length; i++) {
      if (dayKey(d[i].timestamp) < startKey) continue;
      const a = ind.atr14[i - 1];
      if (Number.isNaN(a) || a <= 0) continue;
      const win = d.slice(i, i + N);
      const s = scorePath(
        [win[0].open, ...win.map((b) => b.close)],
        win.map((b) => b.high),
        win.map((b) => b.low),
        a
      );
      const clean = isClean(s);
      // In swing mode "previous" means the window that ended the day before this one started.
      ind.prevClean = cleanByDay.get(i - N) ?? false;
      const conditions = dailyConditions(d, i, ind);
      cleanByDay.set(i, clean);
      units.push({ dayIndex: i, date: d[i].date, ...s, clean, conditions });
    }
  }

  // ---- statistics ----
  const baseN = units.length;
  const baseClean = units.filter((u) => u.clean).length;
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
  const basePct = pct(baseClean, baseN);
  const split = Math.floor(baseN * 0.7);
  const inUnits = units.slice(0, split);
  const outUnits = units.slice(split);
  const inBasePct = pct(inUnits.filter((u) => u.clean).length, inUnits.length);
  const outBasePct = pct(outUnits.filter((u) => u.clean).length, outUnits.length);

  const stats: ConditionStat[] = [];
  for (const c of CONDITIONS) {
    const has = (u: StudyUnit) => u.conditions.includes(c.key);
    const all = units.filter(has);
    if (all.length === 0) continue;
    const ins = inUnits.filter(has);
    const outs = outUnits.filter(has);
    const cleanAll = all.filter((u) => u.clean);
    const inPct = pct(ins.filter((u) => u.clean).length, ins.length);
    const outPct = pct(outs.filter((u) => u.clean).length, outs.length);
    const liftIn = inPct - inBasePct;
    const liftOut = outPct - outBasePct;
    stats.push({
      ...c,
      n: all.length,
      clean: cleanAll.length,
      cleanPct: pct(cleanAll.length, all.length),
      liftPts: pct(cleanAll.length, all.length) - basePct,
      cleanUp: cleanAll.filter((u) => u.dir === 1).length,
      cleanDown: cleanAll.filter((u) => u.dir === -1).length,
      inN: ins.length,
      inPct,
      outN: outs.length,
      outPct,
      holds:
        ins.length >= 30 &&
        outs.length >= 10 &&
        Math.abs(liftIn) >= 2 &&
        Math.sign(liftIn) === Math.sign(liftOut) &&
        Math.abs(liftOut) >= 1,
    });
  }
  stats.sort((x, y) => y.liftPts - x.liftPts);

  const heatmap: HeatCell[] = [...heat.entries()].map(([key, v]) => {
    const [wd, h] = key.split('-').map(Number);
    return { weekday: wd, hour: h, n: v.n, cleanPct: pct(v.clean, v.n), avgDirRatio: v.dr / v.n };
  });

  return {
    units,
    baseN,
    baseClean,
    basePct,
    inBasePct,
    outBasePct,
    splitDate: units[split]?.date ?? null,
    stats,
    heatmap,
  };
}

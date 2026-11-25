/**
 * Minimal backtesting engine modelled on backtrader's flow:
 *  - signals are computed on the close of bar N,
 *  - market orders are filled on the open of bar N+1 (backtrader's default),
 *  - broker applies slippage + percentage commission on each side,
 *  - analyzers (drawdown, Sharpe, trade stats) are computed after the run.
 * Long-only, one position at a time.
 */
import type { Candle } from '../growwApi';
import {
  atr,
  bollinger,
  ema,
  highest,
  lowest,
  macd,
  rsi,
  sma,
  type Series,
} from './indicators';
import { utBotFibSignals, type UtBotFibParams } from './utBotFib';
import { utBotEmaSignals, type UtBotEmaParams } from './utBotEma';
import { turtleSignals, type TurtleParams } from './turtle';

/* ------------------------------ Strategy model ------------------------------ */

export type PriceField = 'open' | 'high' | 'low' | 'close' | 'volume';

export type IndicatorName =
  | 'SMA'
  | 'EMA'
  | 'RSI'
  | 'ATR'
  | 'HIGHEST'
  | 'LOWEST'
  | 'BB_UPPER'
  | 'BB_MID'
  | 'BB_LOWER'
  | 'MACD'
  | 'MACD_SIGNAL'
  | 'MACD_HIST';

export type Operand =
  | { kind: 'price'; field: PriceField }
  | { kind: 'indicator'; name: IndicatorName; period: number }
  | { kind: 'value'; value: number };

export type Comparator = 'crosses_above' | 'crosses_below' | '>' | '<' | '>=' | '<=';

export interface Rule {
  id: string;
  left: Operand;
  op: Comparator;
  right: Operand;
}

export interface Strategy {
  name: string;
  /** All entry rules must be true to open a position. */
  entryRules: Rule[];
  /** Any exit rule being true closes the position. */
  exitRules: Rule[];
  /** Stop loss as % below entry price (0 = disabled). */
  stopLossPct: number;
  /** Take profit as % above entry price (0 = disabled). */
  takeProfitPct: number;
  /**
   * 'percent' (default) uses stopLossPct / takeProfitPct.
   * 'candle' sizes risk from the signal candle: risk = candleStopMult x (high - low),
   * stop = entry - risk, target = entry + rewardRisk x risk.
   */
  /**
   * When set, entries/exits come from this coded signal set instead of the rule lists.
   * A signal in the opposite direction closes the position (and reverses if direction is 'both').
   */
  signalStrategy?: {
    direction: 'long' | 'short' | 'both';
  } & (
    | { kind: 'utbot-fib'; params: UtBotFibParams }
    | { kind: 'utbot-ema'; params: UtBotEmaParams }
    | { kind: 'turtle'; params: TurtleParams }
  );
  riskMode?: 'percent' | 'candle' | 'pyramid';
  /**
   * Used when riskMode is 'pyramid': scale in with equal units as price advances, with an
   * ATR trailing stop that only moves up. No fixed target.
   */
  pyramid?: {
    /** Maximum extra units after the first entry. */
    maxAdds: number;
    /** Add a unit each time close is this many ATRs above the last fill. */
    addAtrMult: number;
    /** Stop sits this many ATRs below the latest fill (0 = no stop). */
    stopAtrMult: number;
    atrPeriod: number;
  };
  /** Multiple of the entry (signal) candle range used as the stop distance. */
  candleStopMult?: number;
  /** Reward-to-risk ratio for the target (2 means 1:2). */
  rewardRisk?: number;
}

export interface BrokerSettings {
  initialCash: number;
  /** Percentage of current equity committed per trade (1-100). */
  stakePct: number;
  /** Commission per side, in percent of trade value. */
  commissionPct: number;
  /** Slippage per fill, in percent of price. */
  slippagePct: number;
  /** Bars per year, used to annualise the Sharpe ratio. */
  periodsPerYear: number;
  /** Annual risk-free rate in percent. */
  riskFreePct: number;
}

/* --------------------------------- Results --------------------------------- */

export type ExitReason = 'Signal' | 'Stop loss' | 'Take profit' | 'End of data';

export interface Trade {
  id: number;
  entryIndex: number;
  exitIndex: number;
  entryDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  size: number;
  /** Net P&L after commissions. */
  pnl: number;
  pnlPct: number;
  commission: number;
  bars: number;
  reason: ExitReason;
  side: 'Long' | 'Short';
}

export interface EquityPoint {
  index: number;
  date: Date;
  equity: number;
  drawdownPct: number;
  buyHold: number;
  close: number;
}

export interface BacktestStats {
  finalEquity: number;
  netProfit: number;
  returnPct: number;
  buyHoldPct: number;
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  sharpe: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  avgBarsInTrade: number;
  exposurePct: number;
  totalCommission: number;
}

export interface BacktestResult {
  trades: Trade[];
  equity: EquityPoint[];
  stats: BacktestStats;
  /** Entry / exit markers keyed by bar index for plotting. */
  markers: { index: number; type: 'buy' | 'sell' }[];
}

/* ------------------------------ Indicator logic ------------------------------ */

export function describeOperand(o: Operand): string {
  switch (o.kind) {
    case 'price':
      return o.field.toUpperCase();
    case 'value':
      return String(o.value);
    case 'indicator':
      if (o.name.startsWith('MACD')) return o.name;
      return `${o.name}(${o.period})`;
  }
}

export function describeRule(r: Rule): string {
  const ops: Record<Comparator, string> = {
    crosses_above: 'crosses above',
    crosses_below: 'crosses below',
    '>': '>',
    '<': '<',
    '>=': '>=',
    '<=': '<=',
  };
  return `${describeOperand(r.left)} ${ops[r.op]} ${describeOperand(r.right)}`;
}

function resolveOperand(o: Operand, candles: Candle[], cache: Map<string, Series>): Series {
  const n = candles.length;
  const key = describeOperand(o);
  const hit = cache.get(key);
  if (hit) return hit;

  let out: Series;
  const closes = () => candles.map((c) => c.close);
  switch (o.kind) {
    case 'value':
      out = new Array<number>(n).fill(o.value);
      break;
    case 'price':
      out = candles.map((c) => c[o.field]);
      break;
    case 'indicator': {
      const p = Math.max(1, Math.floor(o.period));
      switch (o.name) {
        case 'SMA':
          out = sma(closes(), p);
          break;
        case 'EMA':
          out = ema(closes(), p);
          break;
        case 'RSI':
          out = rsi(closes(), p);
          break;
        case 'ATR':
          out = atr(candles, p);
          break;
        case 'HIGHEST':
          out = highest(
            candles.map((c) => c.high),
            p
          );
          break;
        case 'LOWEST':
          out = lowest(
            candles.map((c) => c.low),
            p
          );
          break;
        case 'BB_UPPER':
          out = bollinger(closes(), p).upper;
          break;
        case 'BB_MID':
          out = bollinger(closes(), p).mid;
          break;
        case 'BB_LOWER':
          out = bollinger(closes(), p).lower;
          break;
        case 'MACD':
          out = macd(closes()).macd;
          break;
        case 'MACD_SIGNAL':
          out = macd(closes()).signal;
          break;
        case 'MACD_HIST':
          out = macd(closes()).hist;
          break;
      }
    }
  }
  cache.set(key, out);
  return out;
}

function evalRule(rule: Rule, l: Series, r: Series, i: number): boolean {
  const a = l[i];
  const b = r[i];
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  switch (rule.op) {
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case 'crosses_above': {
      if (i === 0) return false;
      const pa = l[i - 1];
      const pb = r[i - 1];
      return !Number.isNaN(pa) && !Number.isNaN(pb) && pa <= pb && a > b;
    }
    case 'crosses_below': {
      if (i === 0) return false;
      const pa = l[i - 1];
      const pb = r[i - 1];
      return !Number.isNaN(pa) && !Number.isNaN(pb) && pa >= pb && a < b;
    }
  }
}

/* ---------------------------------- Runner ---------------------------------- */

export function runBacktest(
  candles: Candle[],
  strategy: Strategy,
  broker: BrokerSettings
): BacktestResult {
  const n = candles.length;
  if (n < 2) throw new Error('Need at least 2 candles to backtest.');
  const sigStrat = strategy.signalStrategy;
  if (!sigStrat && strategy.entryRules.length === 0) throw new Error('Add at least one entry rule.');
  const sigs: {
    buy: boolean[];
    sell: boolean[];
    exitLong?: boolean[];
    exitShort?: boolean[];
  } | null = !sigStrat
    ? null
    : sigStrat.kind === 'utbot-fib'
      ? utBotFibSignals(candles, sigStrat.params)
      : sigStrat.kind === 'utbot-ema'
        ? utBotEmaSignals(candles, sigStrat.params)
        : turtleSignals(candles, sigStrat.params);
  const allowLong = !sigStrat || sigStrat.direction !== 'short';
  const allowShort = !!sigStrat && sigStrat.direction !== 'long';

  const cache = new Map<string, Series>();
  const compile = (rules: Rule[]) =>
    rules.map((rule) => ({
      rule,
      l: resolveOperand(rule.left, candles, cache),
      r: resolveOperand(rule.right, candles, cache),
    }));
  const entry = compile(strategy.entryRules);
  const exit = compile(strategy.exitRules);

  const slip = broker.slippagePct / 100;
  const comm = broker.commissionPct / 100;

  let cash = broker.initialCash;
  let size = 0;
  let entryPrice = 0;
  let entryIndex = 0;
  let entryComm = 0;
  let stopPrice = NaN;
  let targetPrice = NaN;
  let pending: 'buy' | 'short' | 'sell' | 'add' | null = null;
  /** Direction to open at the same open after a signal exit (reversal). */
  let thenOpen: 'buy' | 'short' | null = null;
  /** 1 = long, -1 = short. */
  let dir: 1 | -1 = 1;
  /** Mark-to-market value of the open position (shorts: collateral + unrealised P&L). */
  const posValue = (price: number) =>
    dir === 1 ? size * price : size * (2 * entryPrice - price);

  const pyr = strategy.riskMode === 'pyramid' ? strategy.pyramid : undefined;
  const maxAdds = pyr ? Math.max(0, Math.floor(pyr.maxAdds)) : 0;
  const atrSeries = pyr ? atr(candles, Math.max(1, Math.floor(pyr.atrPeriod))) : [];
  let adds = 0;
  let unitQty = 0;
  let lastFill = 0;
  let barsInMarket = 0;
  let totalCommission = 0;

  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const markers: BacktestResult['markers'] = [];
  const firstClose = candles[0].close;
  let peak = broker.initialCash;

  const closePosition = (i: number, price: number, reason: ExitReason) => {
    const gross = posValue(price);
    const exitComm = size * price * comm;
    cash += gross - exitComm;
    totalCommission += exitComm;
    const cost = size * entryPrice;
    const pnl = gross - cost - entryComm - exitComm;
    trades.push({
      id: trades.length + 1,
      entryIndex,
      exitIndex: i,
      entryDate: candles[entryIndex].date,
      exitDate: candles[i].date,
      entryPrice,
      exitPrice: price,
      size,
      pnl,
      pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
      commission: entryComm + exitComm,
      bars: i - entryIndex,
      reason,
      side: dir === 1 ? 'Long' : 'Short',
    });
    markers.push({ index: i, type: dir === 1 ? 'sell' : 'buy' });
    size = 0;
  };

  for (let i = 0; i < n; i++) {
    const c = candles[i];

    // 1) Fill orders created on the previous bar's close at this bar's open.
    let open: 'buy' | 'short' | null = null;
    if (pending === 'sell' && size > 0) {
      closePosition(i, (dir === 1 ? 1 - slip : 1 + slip) * c.open, 'Signal');
      open = thenOpen;
    } else if ((pending === 'buy' || pending === 'short') && size === 0) {
      open = pending;
    }
    thenOpen = null;

    if (open && size === 0) {
      dir = open === 'short' ? -1 : 1;
      const price = c.open * (1 + dir * slip);
      // Flat before entry, so equity == cash.
      // With pyramiding, the stake is split into (1 + maxAdds) equal units.
      const budget = Math.min(cash, (cash * broker.stakePct) / 100) / (1 + maxAdds);
      const qty = Math.floor(budget / (price * (1 + comm)));
      if (qty > 0) {
        const value = qty * price;
        entryComm = value * comm;
        cash -= value + entryComm;
        totalCommission += entryComm;
        size = qty;
        entryPrice = price;
        entryIndex = i;
        stopPrice = NaN;
        targetPrice = NaN;
        adds = 0;
        unitQty = qty;
        lastFill = price;
        if (pyr) {
          const a = atrSeries[Math.max(0, i - 1)];
          if (pyr.stopAtrMult > 0 && !Number.isNaN(a) && price - pyr.stopAtrMult * a > 0) {
            stopPrice = price - dir * pyr.stopAtrMult * a;
          }
        } else if (strategy.riskMode === 'candle') {
          // Signal candle is the previous bar (signals fire on close, fill next open).
          const sig = candles[Math.max(0, i - 1)];
          const risk = Math.max(0, strategy.candleStopMult ?? 2) * (sig.high - sig.low);
          if (risk > 0 && price - risk > 0) {
            stopPrice = price - dir * risk;
            const rr = strategy.rewardRisk ?? 2;
            if (rr > 0) targetPrice = price + dir * rr * risk;
          }
        } else {
          if (strategy.stopLossPct > 0) stopPrice = price * (1 - (dir * strategy.stopLossPct) / 100);
          if (strategy.takeProfitPct > 0)
            targetPrice = price * (1 + (dir * strategy.takeProfitPct) / 100);
        }
        markers.push({ index: i, type: dir === 1 ? 'buy' : 'sell' });
      }
    } else if (pending === 'add' && size > 0 && pyr) {
      const price = c.open * (1 + dir * slip);
      const qty = Math.min(unitQty, Math.floor(cash / (price * (1 + comm))));
      if (qty > 0) {
        const value = qty * price;
        const addComm = value * comm;
        cash -= value + addComm;
        totalCommission += addComm;
        entryPrice = (entryPrice * size + value) / (size + qty); // average cost
        size += qty;
        entryComm += addComm;
        adds++;
        lastFill = price;
        const a = atrSeries[Math.max(0, i - 1)];
        if (pyr.stopAtrMult > 0 && !Number.isNaN(a)) {
          const ns = price - dir * pyr.stopAtrMult * a;
          // Trailing: the stop only moves in the trade's favour.
          if (ns > 0 && (Number.isNaN(stopPrice) || dir * (ns - stopPrice) > 0)) stopPrice = ns;
        }
        markers.push({ index: i, type: dir === 1 ? 'buy' : 'sell' });
      }
    }
    pending = null;

    // 2) Intrabar stop-loss / take-profit (stop wins if both hit in one bar).
    if (size > 0) {
      const stop = stopPrice;
      const target = targetPrice;
      if (dir === 1) {
        if (!Number.isNaN(stop) && c.low <= stop) {
          closePosition(i, Math.min(c.open, stop) * (1 - slip), 'Stop loss');
        } else if (!Number.isNaN(target) && c.high >= target) {
          closePosition(i, Math.max(c.open, target) * (1 - slip), 'Take profit');
        }
      } else if (!Number.isNaN(stop) && c.high >= stop) {
        closePosition(i, Math.max(c.open, stop) * (1 + slip), 'Stop loss');
      } else if (!Number.isNaN(target) && c.low <= target) {
        closePosition(i, Math.min(c.open, target) * (1 + slip), 'Take profit');
      }
    }

    // 3) Mark to market.
    if (size > 0) barsInMarket++;
    const eq = size > 0 ? cash + posValue(c.close) : cash;
    peak = Math.max(peak, eq);
    equity.push({
      index: i,
      date: c.date,
      equity: eq,
      drawdownPct: peak > 0 ? ((eq - peak) / peak) * 100 : 0,
      buyHold: firstClose > 0 ? (c.close / firstClose) * broker.initialCash : broker.initialCash,
      close: c.close,
    });

    // 4) Generate signals on this bar's close (executed next bar).
    if (i < n - 1 && sigs) {
      const b = sigs.buy[i];
      const s = sigs.sell[i];
      if (size === 0) {
        if (b && allowLong) pending = 'buy';
        else if (s && allowShort) pending = 'short';
      } else if (dir === 1 && (s || sigs.exitLong?.[i])) {
        pending = 'sell';
        if (s && allowShort) thenOpen = 'short';
      } else if (dir === -1 && (b || sigs.exitShort?.[i])) {
        pending = 'sell';
        if (b && allowLong) thenOpen = 'buy';
      } else if (pyr && adds < maxAdds) {
        const a = atrSeries[i];
        if (!Number.isNaN(a) && dir * (c.close - lastFill) >= pyr.addAtrMult * a) pending = 'add';
      }
    } else if (i < n - 1) {
      if (size === 0) {
        if (entry.every((e) => evalRule(e.rule, e.l, e.r, i))) pending = 'buy';
      } else if (exit.length > 0 && exit.some((e) => evalRule(e.rule, e.l, e.r, i))) {
        pending = 'sell';
      } else if (pyr && adds < maxAdds) {
        const a = atrSeries[i];
        if (!Number.isNaN(a) && c.close >= lastFill + pyr.addAtrMult * a) pending = 'add';
      }
    }
  }

  // Liquidate any open position at the last close so it counts in the stats.
  if (size > 0) {
    const last = n - 1;
    closePosition(last, candles[last].close, 'End of data');
    const e = equity[last];
    e.equity = cash;
  }

  return { trades, equity, markers, stats: computeStats(trades, equity, broker, barsInMarket, totalCommission) };
}

/* --------------------------------- Analyzers --------------------------------- */

function computeStats(
  trades: Trade[],
  equity: EquityPoint[],
  broker: BrokerSettings,
  barsInMarket: number,
  totalCommission: number
): BacktestStats {
  const finalEquity = equity[equity.length - 1].equity;
  const netProfit = finalEquity - broker.initialCash;

  // Max drawdown recomputed from the final equity curve.
  let peak = -Infinity;
  let maxDdPct = 0;
  let maxDdAmt = 0;
  for (const p of equity) {
    peak = Math.max(peak, p.equity);
    const dd = peak - p.equity;
    if (peak > 0 && (dd / peak) * 100 > maxDdPct) maxDdPct = (dd / peak) * 100;
    if (dd > maxDdAmt) maxDdAmt = dd;
  }
  // Keep the charted drawdown consistent with the liquidated curve.
  let runPeak = -Infinity;
  for (const p of equity) {
    runPeak = Math.max(runPeak, p.equity);
    p.drawdownPct = runPeak > 0 ? ((p.equity - runPeak) / runPeak) * 100 : 0;
  }

  // Sharpe: mean excess per-bar return / stdev, annualised.
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].equity;
    if (prev > 0) rets.push(equity[i].equity / prev - 1);
  }
  const rf = broker.riskFreePct / 100 / broker.periodsPerYear;
  let sharpe = 0;
  if (rets.length > 1) {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
    const sd = Math.sqrt(variance);
    sharpe = sd > 0 ? ((mean - rf) / sd) * Math.sqrt(broker.periodsPerYear) : 0;
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const last = equity[equity.length - 1];

  return {
    finalEquity,
    netProfit,
    returnPct: (netProfit / broker.initialCash) * 100,
    buyHoldPct: (last.buyHold / broker.initialCash - 1) * 100,
    maxDrawdownPct: maxDdPct,
    maxDrawdownAmount: maxDdAmt,
    sharpe,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    bestTrade: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0,
    worstTrade: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0,
    avgBarsInTrade: trades.length ? trades.reduce((s, t) => s + t.bars, 0) / trades.length : 0,
    exposurePct: (barsInMarket / equity.length) * 100,
    totalCommission,
  };
}

/** Bars per trading year for a Groww interval in minutes (NSE: 375 min/session, 252 sessions). */
export function periodsPerYear(intervalMinutes: number): number {
  if (intervalMinutes >= 10080) return 52;
  if (intervalMinutes >= 1440) return 252;
  return Math.round((252 * 375) / intervalMinutes);
}

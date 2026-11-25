import type { Operand, Rule, Strategy } from './engine';
// Imports for the commented-out presets below. Uncomment together with the preset.
// import { DEFAULT_UTBOT_FIB } from './utBotFib';
// import { DEFAULT_UTBOT_EMA } from './utBotEma';
// import { TURTLE_SYSTEM_1, TURTLE_SYSTEM_2 } from './turtle';

let counter = 0;
export const newRuleId = (): string => `r${Date.now().toString(36)}${counter++}`;

const ind = (name: Extract<Operand, { kind: 'indicator' }>['name'], period = 14): Operand => ({
  kind: 'indicator',
  name,
  period,
});
const val = (value: number): Operand => ({ kind: 'value', value });
const close: Operand = { kind: 'price', field: 'close' };

const rule = (left: Operand, op: Rule['op'], right: Operand): Rule => ({
  id: newRuleId(),
  left,
  op,
  right,
});

export interface Preset {
  key: string;
  label: string;
  description: string;
  build: () => Strategy;
}

export const PRESETS: Preset[] = [
  // {
  //   key: 'turtle-1',
  //   label: 'Turtle Trading – System 1 (20/10)',
  //   description:
  //     "Richard Dennis's Turtles: buy a close above the 20-bar high, short a close below the 20-bar low, exit on a 10-bar opposite breakout. 4 units max, add every 0.5N, stop 2N below the latest unit (N = ATR 20).",
  //   build: () => ({
  //     name: 'Turtle System 1',
  //     entryRules: [],
  //     exitRules: [],
  //     stopLossPct: 0,
  //     takeProfitPct: 0,
  //     riskMode: 'pyramid',
  //     pyramid: { maxAdds: 3, addAtrMult: 0.5, stopAtrMult: 2, atrPeriod: 20 },
  //     signalStrategy: { kind: 'turtle', params: { ...TURTLE_SYSTEM_1 }, direction: 'both' },
  //   }),
  // },
  // {
  //   key: 'turtle-2',
  //   label: 'Turtle Trading – System 2 (55/20)',
  //   description:
  //     'Slower Turtle system: 55-bar breakout entry, 20-bar opposite breakout exit, same N-based pyramiding and 2N stop.',
  //   build: () => ({
  //     name: 'Turtle System 2',
  //     entryRules: [],
  //     exitRules: [],
  //     stopLossPct: 0,
  //     takeProfitPct: 0,
  //     riskMode: 'pyramid',
  //     pyramid: { maxAdds: 3, addAtrMult: 0.5, stopAtrMult: 2, atrPeriod: 20 },
  //     signalStrategy: { kind: 'turtle', params: { ...TURTLE_SYSTEM_2 }, direction: 'both' },
  //   }),
  // },
  // {
  //   key: 'utbot-ema',
  //   label: 'UT Bot + 50 EMA Proximity & Trend (Pine port)',
  //   description:
  //     'UT Bot flips only count when price is on the right side of the 50 EMA, within 0.5% of it, and the EMA is trending the same way (rising for buys, falling for sells). An opposite signal closes the trade.',
  //   build: () => ({
  //     name: 'UT Bot + EMA Filter',
  //     entryRules: [],
  //     exitRules: [],
  //     stopLossPct: 0,
  //     takeProfitPct: 0,
  //     riskMode: 'percent',
  //     signalStrategy: { kind: 'utbot-ema', params: { ...DEFAULT_UTBOT_EMA }, direction: 'both' },
  //   }),
  // },
  // {
  //   key: 'utbot-fib',
  //   label: 'UT Bot + Fib Band Scalper (Pine port)',
  //   description:
  //     'Your Pine Script: UT Bot flips confirmed by a prior touch of the 2.618-stdev bands, one direction per day. An opposite signal closes the trade.',
  //   build: () => ({
  //     name: 'UT Bot + Fib Band',
  //     entryRules: [],
  //     exitRules: [],
  //     stopLossPct: 0,
  //     takeProfitPct: 0,
  //     riskMode: 'percent',
  //     signalStrategy: { kind: 'utbot-fib', params: { ...DEFAULT_UTBOT_FIB }, direction: 'both' },
  //   }),
  // },
  {
    key: 'ema50-rr',
    label: 'EMA 50 Breakout (1:2 R:R)',
    description:
      'Buy when price closes above the 50 EMA, exit when it closes below. Stop = 2x the entry candle range below entry, target = 2x the risk (1:2).',
    build: () => ({
      name: 'EMA 50 Breakout 1:2',
      entryRules: [rule(close, 'crosses_above', ind('EMA', 50))],
      exitRules: [rule(close, 'crosses_below', ind('EMA', 50))],
      stopLossPct: 0,
      takeProfitPct: 0,
      riskMode: 'candle',
      candleStopMult: 2,
      rewardRisk: 2,
    }),
  },
  {
    key: 'ema50-pyramid',
    label: 'EMA 50 Trend + Pyramiding (ATR)',
    description:
      'Enter on a close above the 50 EMA, add a unit every 1 ATR of progress (up to 3 adds), ATR trailing stop 2 ATR below the latest fill, exit on a close below the 50 EMA.',
    build: () => ({
      name: 'EMA 50 Trend Pyramid',
      entryRules: [rule(close, 'crosses_above', ind('EMA', 50))],
      exitRules: [rule(close, 'crosses_below', ind('EMA', 50))],
      stopLossPct: 0,
      takeProfitPct: 0,
      riskMode: 'pyramid',
      pyramid: { maxAdds: 3, addAtrMult: 1, stopAtrMult: 2, atrPeriod: 14 },
    }),
  },
  {
    key: 'sma-cross',
    label: 'SMA Crossover (10/30)',
    description:
      'The backtrader README example: buy when SMA(10) crosses above SMA(30), sell on the reverse.',
    build: () => ({
      name: 'SMA Crossover',
      entryRules: [rule(ind('SMA', 10), 'crosses_above', ind('SMA', 30))],
      exitRules: [rule(ind('SMA', 10), 'crosses_below', ind('SMA', 30))],
      stopLossPct: 0,
      takeProfitPct: 0,
    }),
  },
  {
    key: 'ema-cross',
    label: 'EMA Crossover (12/26)',
    description: 'Faster trend follower using exponential averages with a 5% stop loss.',
    build: () => ({
      name: 'EMA Crossover',
      entryRules: [rule(ind('EMA', 12), 'crosses_above', ind('EMA', 26))],
      exitRules: [rule(ind('EMA', 12), 'crosses_below', ind('EMA', 26))],
      stopLossPct: 5,
      takeProfitPct: 0,
    }),
  },
  {
    key: 'rsi-reversion',
    label: 'RSI Mean Reversion',
    description: 'Buy when RSI(14) drops below 30, exit when it rises above 55.',
    build: () => ({
      name: 'RSI Mean Reversion',
      entryRules: [rule(ind('RSI', 14), '<', val(30))],
      exitRules: [rule(ind('RSI', 14), '>', val(55))],
      stopLossPct: 4,
      takeProfitPct: 0,
    }),
  },
  {
    key: 'bollinger',
    label: 'Bollinger Band Bounce',
    description: 'Buy when price closes below the lower band, exit at the middle band.',
    build: () => ({
      name: 'Bollinger Bounce',
      entryRules: [rule(close, '<', ind('BB_LOWER', 20))],
      exitRules: [rule(close, '>', ind('BB_MID', 20))],
      stopLossPct: 4,
      takeProfitPct: 0,
    }),
  },
  {
    key: 'macd',
    label: 'MACD Signal Cross',
    description: 'Buy when MACD crosses above its signal line, sell when it crosses below.',
    build: () => ({
      name: 'MACD Cross',
      entryRules: [rule(ind('MACD', 0), 'crosses_above', ind('MACD_SIGNAL', 0))],
      exitRules: [rule(ind('MACD', 0), 'crosses_below', ind('MACD_SIGNAL', 0))],
      stopLossPct: 0,
      takeProfitPct: 0,
    }),
  },
  {
    key: 'custom',
    label: 'Blank (build your own)',
    description: 'Start with one empty entry rule.',
    build: () => ({
      name: 'My Strategy',
      entryRules: [rule(close, '>', ind('SMA', 20))],
      exitRules: [rule(close, '<', ind('SMA', 20))],
      stopLossPct: 0,
      takeProfitPct: 0,
    }),
  },
];

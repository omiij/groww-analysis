import type React from 'react';
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  Area,
  AreaChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartPanel from '../components/ChartPanel';
import MetricCard from '../components/MetricCard';
import RuleEditor from '../components/RuleEditor';
import CandleChart from '../components/CandleChart';
import { COLORS, panelSx, pnlColor } from '../lib/theme';
import { formatINR, formatSignedINR } from '../lib/format';
import {
  datetimeLocalToApiTime,
  getHistoricalCandles,
  type Candle,
  type Exchange,
  type Segment,
} from '../lib/growwApi';
import {
  describeRule,
  periodsPerYear,
  runBacktest,
  type BacktestResult,
  type BrokerSettings,
  type Strategy,
} from '../lib/backtest/engine';
import { PRESETS } from '../lib/backtest/presets';
import { getYahooCandles, INDICES, toYahooSymbol, YAHOO_INTERVALS } from '../lib/yahooApi';

type Source = 'yahoo' | 'groww';

const INTERVALS = [
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
  { label: '1 day', value: 1440 },
  { label: '1 week', value: 10080 },
];

/** Default look-back (days) per interval, kept inside Yahoo's intraday limits. */
const DEFAULT_LOOKBACK_DAYS: Record<number, number> = {
  5: 55,
  10: 30,
  15: 55,
  60: 700,
  240: 365,
  1440: 365,
  10080: 1825,
};

const STORAGE_KEY = 'backtest.savedStrategies.v1';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const daysAgo = (days: number) => toLocalInput(new Date(Date.now() - days * 86400000));

function loadSaved(): Strategy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Strategy[]) : [];
  } catch {
    return [];
  }
}

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const tooltipStyle = {
  background: COLORS.panelAlt,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: COLORS.textPrimary,
};

const Backtesting: React.FC = () => {
  // ---- data ----
  const [source, setSource] = useState<Source>('yahoo');
  const [instrument, setInstrument] = useState<'stock' | 'index'>('stock');
  const [symbol, setSymbol] = useState('RELIANCE');
  const [exchange, setExchange] = useState<Exchange>('NSE');
  const [segment] = useState<Segment>('CASH');
  const [interval, setIntervalMin] = useState(1440);
  const [startLocal, setStartLocal] = useState(() => daysAgo(365));
  const [endLocal, setEndLocal] = useState(() => daysAgo(0));
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // ---- strategy ----
  const [presetKey, setPresetKey] = useState(PRESETS[0].key);
  const [strategy, setStrategy] = useState<Strategy>(() => PRESETS[0].build());
  const [saved, setSaved] = useState<Strategy[]>(loadSaved);

  // ---- broker ----
  const [initialCash, setInitialCash] = useState(100000);
  const [stakePct, setStakePct] = useState(100);
  const [commissionPct, setCommissionPct] = useState(0.05);
  const [slippagePct, setSlippagePct] = useState(0.05);

  // ---- results ----
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [ranWith, setRanWith] = useState<{ strategy: string; symbol: string } | null>(null);
  const [error, setError] = useState('');

  const intraday = interval < 1440;
  const label = (d: Date) =>
    intraday
      ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

  /** Switch interval and reset start/end to a sensible range for it (end = now). */
  const changeInterval = (minutes: number) => {
    setIntervalMin(minutes);
    setStartLocal(daysAgo(DEFAULT_LOOKBACK_DAYS[minutes] ?? 365));
    setEndLocal(daysAgo(0));
    setCandles([]);
    setResult(null);
  };

  const applyPreset = (key: string) => {
    setPresetKey(key);
    setStrategy(PRESETS.find((p) => p.key === key)!.build());
    setResult(null);
  };

  const fetchData = async () => {
    setLoadingData(true);
    setError('');
    try {
      const start = datetimeLocalToApiTime(startLocal);
      const end = datetimeLocalToApiTime(endLocal);
      if (!symbol.trim()) throw new Error('Enter a trading symbol.');
      if (!start || !end) throw new Error('Pick a start and end time.');
      let list: Candle[];
      if (source === 'yahoo') {
        list = await getYahooCandles({
          symbol,
          exchange,
          intervalInMinutes: interval,
          start: new Date(startLocal),
          end: new Date(endLocal),
        });
      } else {
        const res = await getHistoricalCandles({
          tradingSymbol: symbol.trim().toUpperCase(),
          exchange,
          segment,
          startTime: start,
          endTime: end,
          intervalInMinutes: interval,
        });
        list = res.candles;
      }
      setCandles(list);
      setResult(null);
      if (list.length === 0) setError('No candles returned. Try a wider range or another interval.');
    } catch (err) {
      setCandles([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingData(false);
    }
  };

  const run = () => {
    setError('');
    try {
      const broker: BrokerSettings = {
        initialCash,
        stakePct: Math.min(100, Math.max(1, stakePct)),
        commissionPct: Math.max(0, commissionPct),
        slippagePct: Math.max(0, slippagePct),
        periodsPerYear: periodsPerYear(interval),
        riskFreePct: 0,
      };
      if (initialCash <= 0) throw new Error('Starting cash must be positive.');
      setResult(runBacktest(candles, strategy, broker));
      setRanWith({ strategy: strategy.name, symbol: symbol.trim().toUpperCase() });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const persist = (list: Strategy[]) => {
    setSaved(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };
  const saveStrategy = () => {
    const name = strategy.name.trim() || 'Untitled';
    persist([...saved.filter((s) => s.name !== name), { ...strategy, name }]);
  };

  const equityData = useMemo(
    () =>
      result?.equity.map((p) => ({
        label: label(p.date),
        equity: Math.round(p.equity * 100) / 100,
        buyHold: Math.round(p.buyHold * 100) / 100,
        drawdown: Math.round(p.drawdownPct * 100) / 100,
      })) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, interval]
  );

  const priceData = useMemo(() => {
    if (!result) return [];
    const buys = new Set(result.markers.filter((m) => m.type === 'buy').map((m) => m.index));
    const sells = new Set(result.markers.filter((m) => m.type === 'sell').map((m) => m.index));
    return candles.map((c, i) => ({
      label: label(c.date),
      close: c.close,
      buy: buys.has(i) ? c.low : null,
      sell: sells.has(i) ? c.high : null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, candles, interval]);

  const s = result?.stats;
  const numField = (
    labelText: string,
    value: number,
    set: (n: number) => void,
    step = 1
  ) => (
    <TextField
      fullWidth
      size="small"
      type="number"
      label={labelText}
      value={value}
      onChange={(e) => set(Number(e.target.value))}
      slotProps={{ htmlInput: { step, min: 0 } }}
    />
  );

  return (
    <Box>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 'bold',
          mb: 0.5,
          color: COLORS.textPrimary,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
        <ScienceIcon color="primary" fontSize="large" /> Strategy Backtesting
      </Typography>
      <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 3 }}>
        Build a rule-based strategy and test it on historical candles (free Yahoo Finance data by default, or Groww). The engine follows
        backtrader's model: signals on a bar's close, fills at the next bar's open, with commission
        and slippage. Long-only, one position at a time.
      </Typography>

      {/* ===== 1. Data ===== */}
      <Paper sx={{ ...panelSx, p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary, mb: 2 }}>
          1. Market data
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Data source"
              value={source}
              onChange={(e) => {
                const next = e.target.value as Source;
                setSource(next);
                if (next === 'yahoo' && !YAHOO_INTERVALS.some((i) => i.value === interval)) {
                  changeInterval(1440);
                } else {
                  setCandles([]);
                  setResult(null);
                }
              }}>
              <MenuItem value="yahoo">Yahoo Finance (free)</MenuItem>
              <MenuItem value="groww">Groww API</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Instrument"
              value={instrument}
              onChange={(e) => {
                const next = e.target.value as 'stock' | 'index';
                setInstrument(next);
                if (next === 'index') {
                  setSymbol(INDICES[0].symbol);
                  setExchange(INDICES[0].exchange);
                } else {
                  setSymbol('RELIANCE');
                }
                setCandles([]);
                setResult(null);
              }}>
              <MenuItem value="stock">Stock</MenuItem>
              <MenuItem value="index">Index</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            {instrument === 'index' ? (
              <TextField
                fullWidth
                select
                size="small"
                label="Index"
                value={INDICES.some((x) => x.symbol === symbol) ? symbol : INDICES[0].symbol}
                onChange={(e) => {
                  const idx = INDICES.find((x) => x.symbol === e.target.value)!;
                  setSymbol(idx.symbol);
                  setExchange(idx.exchange);
                  setCandles([]);
                  setResult(null);
                }}
                helperText={source === 'yahoo' ? `Yahoo ticker: ${toYahooSymbol(symbol, exchange)}` : undefined}>
                {INDICES.map((x) => (
                  <MenuItem key={x.symbol} value={x.symbol}>
                    {x.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                fullWidth
                size="small"
                label="Trading Symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                helperText={
                  source === 'yahoo' && symbol.trim()
                    ? `Yahoo ticker: ${toYahooSymbol(symbol, exchange)}`
                    : 'e.g. RELIANCE, TCS, HDFCBANK'
                }
              />
            )}
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Exchange"
              value={exchange}
              onChange={(e) => setExchange(e.target.value as Exchange)}>
              <MenuItem value="NSE">NSE</MenuItem>
              <MenuItem value="BSE">BSE</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Interval"
              value={interval}
              onChange={(e) => changeInterval(Number(e.target.value))}>
              {(source === 'yahoo' ? YAHOO_INTERVALS : INTERVALS).map((x) => (
                <MenuItem key={x.value} value={x.value}>
                  {x.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
            <TextField
              fullWidth
              size="small"
              type="datetime-local"
              label="Start"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
            <TextField
              fullWidth
              size="small"
              type="datetime-local"
              label="End"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
        </Grid>
        <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            onClick={fetchData}
            disabled={loadingData}
            startIcon={loadingData ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {loadingData ? 'Loading…' : 'Load candles'}
          </Button>
          {candles.length > 0 && (
            <Chip
              size="small"
              label={`${candles.length} candles · ${candles[0].date.toLocaleDateString('en-IN')} → ${candles[
                candles.length - 1
              ].date.toLocaleDateString('en-IN')}`}
              sx={{ bgcolor: `${COLORS.info}22`, color: COLORS.info }}
            />
          )}
        </Box>
      </Paper>

      {candles.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <CandleChart
            candles={candles}
            formatLabel={label}
            title={`${symbol.trim().toUpperCase()} price (${candles.length} candles)`}
          />
        </Box>
      )}

      {/* ===== 2. Strategy ===== */}
      <Paper sx={{ ...panelSx, p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary, mb: 2 }}>
          2. Strategy
        </Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Start from template"
              value={presetKey}
              onChange={(e) => applyPreset(e.target.value)}
              helperText={PRESETS.find((p) => p.key === presetKey)?.description}>
              {PRESETS.map((p) => (
                <MenuItem key={p.key} value={p.key}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              label="Strategy name"
              value={strategy.name}
              onChange={(e) => setStrategy({ ...strategy, name: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Stop / target type"
              value={strategy.riskMode ?? 'percent'}
              onChange={(e) =>
                setStrategy({
                  ...strategy,
                  riskMode: e.target.value as 'percent' | 'candle' | 'pyramid',
                  pyramid:
                    strategy.pyramid ?? { maxAdds: 3, addAtrMult: 1, stopAtrMult: 2, atrPeriod: 14 },
                })
              }>
              <MenuItem value="percent">Fixed % of entry price</MenuItem>
              <MenuItem value="candle">Entry candle range + reward:risk</MenuItem>
              <MenuItem value="pyramid">Pyramiding + ATR trailing stop</MenuItem>
            </TextField>
          </Grid>
          {strategy.riskMode === 'pyramid' ? (
            <>
              {(
                [
                  ['Max adds', 'maxAdds', 1],
                  ['Add every × ATR', 'addAtrMult', 0.25],
                  ['Stop × ATR', 'stopAtrMult', 0.25],
                  ['ATR period', 'atrPeriod', 1],
                ] as const
              ).map(([lbl, key, step]) => (
                <Grid key={key} size={{ xs: 6, md: 3 }}>
                  {numField(lbl, strategy.pyramid?.[key] ?? 0, (n) =>
                    setStrategy({
                      ...strategy,
                      pyramid: {
                        maxAdds: 3,
                        addAtrMult: 1,
                        stopAtrMult: 2,
                        atrPeriod: 14,
                        ...strategy.pyramid,
                        [key]: Math.max(0, n),
                      },
                    }), step
                  )}
                </Grid>
              ))}
            </>
          ) : strategy.riskMode === 'candle' ? (
            <>
              <Grid size={{ xs: 6, md: 3 }}>
                {numField('Stop = × entry candle range', strategy.candleStopMult ?? 2, (n) =>
                  setStrategy({ ...strategy, candleStopMult: Math.max(0, n) }), 0.25
                )}
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                {numField('Reward : risk (1 : x)', strategy.rewardRisk ?? 2, (n) =>
                  setStrategy({ ...strategy, rewardRisk: Math.max(0, n) }), 0.5
                )}
              </Grid>
            </>
          ) : (
            <>
              <Grid size={{ xs: 6, md: 3 }}>
                {numField('Stop loss %', strategy.stopLossPct, (n) =>
                  setStrategy({ ...strategy, stopLossPct: Math.max(0, n) }), 0.5
                )}
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                {numField('Take profit %', strategy.takeProfitPct, (n) =>
                  setStrategy({ ...strategy, takeProfitPct: Math.max(0, n) }), 0.5
                )}
              </Grid>
            </>
          )}
        </Grid>

        {strategy.signalStrategy ? (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                {strategy.signalStrategy.kind === 'turtle'
                  ? 'Turtle breakout: BUY when the close breaks above the highest high of the entry window, SHORT when it breaks below the lowest low. Exit when price breaks the shorter exit window the other way. Units, 0.5N adds and the 2N stop are set under "Pyramiding + ATR trailing stop" above (N = ATR).'
                  : strategy.signalStrategy.kind === 'utbot-fib'
                  ? 'Signals come from the UT Bot + Fib Band script. BUY: UT Bot flips up after price touched the lower band. SELL: flips down after touching the upper band.'
                  : 'Signals come from the UT Bot + EMA filter script. BUY: UT Bot flips up while price is above the filter EMA, within the max % of it, and (with Trend only on) the EMA is rising versus the lookback. SELL: flips down while below the EMA, within the max %, and the EMA is falling.'}{' '}
                An opposite signal closes the trade (and reverses it when direction is "Both"). Stop loss / take
                profit settings above also apply.
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                fullWidth
                select
                size="small"
                label="Trade direction"
                value={strategy.signalStrategy.direction}
                onChange={(e) =>
                  setStrategy({
                    ...strategy,
                    signalStrategy: {
                      ...strategy.signalStrategy!,
                      direction: e.target.value as 'long' | 'short' | 'both',
                    },
                  })
                }>
                <MenuItem value="both">Both (buy and short)</MenuItem>
                <MenuItem value="long">Long only (use for option buying)</MenuItem>
                <MenuItem value="short">Short only</MenuItem>
              </TextField>
            </Grid>
            {(() => {
              const sig = strategy.signalStrategy!;
              const params = sig.params as unknown as Record<string, number | boolean>;
              const setParam = (key: string, v: number | boolean) =>
                setStrategy({
                  ...strategy,
                  signalStrategy: { ...sig, params: { ...sig.params, [key]: v } } as Strategy['signalStrategy'],
                });
              const nums: [string, string, number][] =
                sig.kind === 'turtle'
                  ? [
                      ['Entry breakout (bars)', 'entryLength', 1],
                      ['Exit breakout (bars)', 'exitLength', 1],
                    ]
                  : sig.kind === 'utbot-fib'
                  ? [
                      ['Sensitivity (a)', 'sensitivity', 0.1],
                      ['ATR period', 'atrPeriod', 1],
                      ['Band length', 'bandLength', 1],
                      ['Band × stdev', 'bandMult', 0.1],
                    ]
                  : [
                      ['Key value (a)', 'sensitivity', 0.1],
                      ['ATR period', 'atrPeriod', 1],
                      ['Filter EMA length', 'emaLength', 1],
                      ['Max % from EMA', 'pctThreshold', 0.1],
                      ['Trend lookback (bars)', 'trendLookback', 1],
                    ];
              const toggles: [string, string, string, string][] =
                sig.kind === 'turtle'
                  ? []
                  : sig.kind === 'utbot-fib'
                    ? [['Day lock', 'dailyLock', 'On', 'Off']]
                    : [
                        ['Trend only', 'trendFilter', 'On', 'Off'],
                        ['Heikin Ashi', 'heikinAshi', 'Yes', 'No'],
                      ];
              return (
                <>
                  {nums.map(([lbl, key, step]) => (
                    <Grid key={key} size={{ xs: 6, md: 2 }}>
                      {numField(lbl, Number(params[key]), (n) => setParam(key, Math.max(0.1, n)), step)}
                    </Grid>
                  ))}
                  {toggles.map((toggle) => (
                    <Grid key={toggle[1]} size={{ xs: 6, md: 1 }}>
                      <TextField
                        fullWidth
                        select
                        size="small"
                        label={toggle[0]}
                        value={params[toggle[1]] ? 'on' : 'off'}
                        onChange={(e) => setParam(toggle[1], e.target.value === 'on')}>
                        <MenuItem value="on">{toggle[2]}</MenuItem>
                        <MenuItem value="off">{toggle[3]}</MenuItem>
                      </TextField>
                    </Grid>
                  ))}
                </>
              );
            })()}
          </Grid>
        ) : (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <RuleEditor
              title="Enter long when ALL are true"
              hint="Evaluated on each bar's close while flat. Buys at the next open."
              rules={strategy.entryRules}
              onChange={(entryRules) => setStrategy({ ...strategy, entryRules })}
            />
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <RuleEditor
              title="Exit when ANY is true"
              hint="Optional. Stop loss and take profit also apply if set."
              rules={strategy.exitRules}
              onChange={(exitRules) => setStrategy({ ...strategy, exitRules })}
            />
          </Grid>
        </Grid>
        )}

        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.06)' }} />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button size="small" startIcon={<SaveIcon />} onClick={saveStrategy}>
            Save strategy
          </Button>
          {saved.map((sv) => (
            <Chip
              key={sv.name}
              label={sv.name}
              onClick={() => {
                setStrategy(sv);
                setResult(null);
              }}
              onDelete={() => persist(saved.filter((x) => x.name !== sv.name))}
              deleteIcon={<DeleteOutlineIcon />}
              variant="outlined"
              size="small"
            />
          ))}
          {saved.length === 0 && (
            <Typography variant="caption" sx={{ color: COLORS.textFaint }}>
              Saved strategies are stored in this browser.
            </Typography>
          )}
        </Box>
      </Paper>

      {/* ===== 3. Broker + run ===== */}
      <Paper sx={{ ...panelSx, p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary, mb: 2 }}>
          3. Broker simulation
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, md: 3 }}>{numField('Starting cash (₹)', initialCash, setInitialCash, 1000)}</Grid>
          <Grid size={{ xs: 6, md: 3 }}>{numField('Stake (% of cash per trade)', stakePct, setStakePct, 5)}</Grid>
          <Grid size={{ xs: 6, md: 3 }}>{numField('Commission % per side', commissionPct, setCommissionPct, 0.01)}</Grid>
          <Grid size={{ xs: 6, md: 3 }}>{numField('Slippage % per fill', slippagePct, setSlippagePct, 0.01)}</Grid>
        </Grid>
        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={run}
            disabled={candles.length < 2}>
            Run backtest
          </Button>
          {candles.length < 2 && (
            <Typography variant="caption" sx={{ ml: 2, color: COLORS.textMuted }}>
              Load candles first.
            </Typography>
          )}
        </Box>
      </Paper>

      {error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* ===== Results ===== */}
      {result && s && (
        <>
          <Typography variant="h6" sx={{ color: COLORS.textPrimary, fontWeight: 'bold', mb: 0.5 }}>
            Results: {ranWith?.strategy} on {ranWith?.symbol}
          </Typography>
          <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block', mb: 2 }}>
            {strategy.signalStrategy ? (
              <>
                {strategy.signalStrategy.kind === 'turtle'
                  ? `Turtle ${strategy.signalStrategy.params.entryLength}/${strategy.signalStrategy.params.exitLength} breakout`
                  : strategy.signalStrategy.kind === 'utbot-fib'
                    ? 'UT Bot + Fib Band'
                    : 'UT Bot + EMA filter'}{' '}
                signals · direction: {strategy.signalStrategy.direction}
              </>
            ) : (
              <>
                Entry: {strategy.entryRules.map(describeRule).join(' AND ') || '—'} · Exit:{' '}
                {strategy.exitRules.map(describeRule).join(' OR ') || '—'}
              </>
            )}
          </Typography>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard
                caption="Net profit"
                accent={pnlColor(s.netProfit)}
                valueColor={pnlColor(s.netProfit)}
                value={formatSignedINR(s.netProfit)}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard
                caption="Return vs buy & hold"
                accent={COLORS.info}
                value={`${fmtPct(s.returnPct)} / ${fmtPct(s.buyHoldPct)}`}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard
                caption="Max drawdown"
                accent={COLORS.danger}
                value={`-${s.maxDrawdownPct.toFixed(2)}%`}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard caption="Sharpe ratio" accent={COLORS.warning} value={s.sharpe.toFixed(2)} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard
                caption="Trades (W / L)"
                accent={COLORS.info}
                value={`${s.totalTrades} (${s.wins} / ${s.losses})`}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard caption="Win rate" accent={COLORS.success} value={`${s.winRatePct.toFixed(1)}%`} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard
                caption="Profit factor"
                accent={COLORS.success}
                value={Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard caption="Time in market" accent={COLORS.warning} value={`${s.exposurePct.toFixed(1)}%`} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard caption="Avg win / avg loss" accent={COLORS.success} value={`${formatINR(Math.round(s.avgWin))} / ${formatINR(Math.round(s.avgLoss))}`} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard caption="Best / worst trade" accent={COLORS.info} value={`${formatINR(Math.round(s.bestTrade))} / ${formatINR(Math.round(s.worstTrade))}`} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard caption="Avg bars in trade" accent={COLORS.info} value={s.avgBarsInTrade.toFixed(1)} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard caption="Commission paid" accent={COLORS.warning} value={formatINR(Math.round(s.totalCommission))} />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12 }}>
              <ChartPanel title="Equity curve vs buy & hold" accent={COLORS.success} height={300}>
                <ComposedChart data={equityData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} minTickGap={40} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} domain={['auto', 'auto']} width={72} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v), true)} />
                  <Line type="monotone" dataKey="buyHold" name="Buy & hold" stroke={COLORS.textFaint} strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="equity" name="Strategy" stroke={COLORS.success} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ChartPanel>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <ChartPanel title="Price with entries (green) and exits (red)" accent={COLORS.info} height={300}>
                <ComposedChart data={priceData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} minTickGap={40} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} domain={['auto', 'auto']} width={64} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v), true)} />
                  <Line type="monotone" dataKey="close" name="Close" stroke={COLORS.info} strokeWidth={1.5} dot={false} />
                  <Line dataKey="buy" name="Buy" stroke="none" isAnimationActive={false} dot={{ r: 5, fill: COLORS.success, stroke: 'none' }} activeDot={false} legendType="none" />
                  <Line dataKey="sell" name="Sell" stroke="none" isAnimationActive={false} dot={{ r: 5, fill: COLORS.danger, stroke: 'none' }} activeDot={false} legendType="none" />
                </ComposedChart>
              </ChartPanel>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <ChartPanel title="Drawdown %" accent={COLORS.danger} height={200}>
                <AreaChart data={equityData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} minTickGap={40} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} width={48} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(2)}%`} />
                  <Area type="monotone" dataKey="drawdown" name="Drawdown" stroke={COLORS.danger} fill={COLORS.danger} fillOpacity={0.25} />
                </AreaChart>
              </ChartPanel>
            </Grid>
          </Grid>

          <Paper sx={{ ...panelSx, p: 0, overflow: 'hidden' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary }}>
                Trades ({result.trades.length})
              </Typography>
            </Box>
            {result.trades.length === 0 ? (
              <Typography sx={{ p: 3, color: COLORS.textMuted }}>
                No trades were triggered. Loosen the entry rules or load a longer date range.
              </Typography>
            ) : (
              <TableContainer sx={{ maxHeight: 420 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Side</TableCell>
                      <TableCell>Entry</TableCell>
                      <TableCell>Exit</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Entry ₹</TableCell>
                      <TableCell align="right">Exit ₹</TableCell>
                      <TableCell align="right">P&amp;L</TableCell>
                      <TableCell align="right">P&amp;L %</TableCell>
                      <TableCell align="right">Bars</TableCell>
                      <TableCell>Exit reason</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.trades.map((t) => (
                      <TableRow key={t.id} hover>
                        <TableCell sx={{ color: COLORS.textMuted }}>{t.id}</TableCell>
                        <TableCell sx={{ color: t.side === 'Long' ? COLORS.success : COLORS.danger }}>{t.side}</TableCell>
                        <TableCell sx={{ color: COLORS.textBody, whiteSpace: 'nowrap' }}>{label(t.entryDate)}</TableCell>
                        <TableCell sx={{ color: COLORS.textBody, whiteSpace: 'nowrap' }}>{label(t.exitDate)}</TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textBody }}>{t.size}</TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textBody }}>{formatINR(t.entryPrice, true)}</TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textBody }}>{formatINR(t.exitPrice, true)}</TableCell>
                        <TableCell align="right" sx={{ color: pnlColor(t.pnl), fontWeight: 600 }}>{formatSignedINR(t.pnl)}</TableCell>
                        <TableCell align="right" sx={{ color: pnlColor(t.pnl) }}>{fmtPct(t.pnlPct)}</TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textMuted }}>{t.bars}</TableCell>
                        <TableCell sx={{ color: COLORS.textMuted }}>{t.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
};

export default Backtesting;

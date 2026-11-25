import type React from 'react';
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
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
  Tooltip as MuiTooltip,
  Typography,
} from '@mui/material';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import ChartPanel from '../components/ChartPanel';
import MetricCard from '../components/MetricCard';
import { COLORS, panelSx } from '../lib/theme';
import type { Candle } from '../lib/growwApi';
import { getYahooCandles, INDICES } from '../lib/yahooApi';
import {
  CONDITIONS,
  DEFAULT_THRESHOLDS,
  runMoveStudy,
  WEEKDAYS,
  type CleanThresholds,
  type StudyMode,
} from '../lib/moveStudy';

/** NIFTY MIDCAP SELECT has almost no history on Yahoo, and VIX is a condition input, not a target. */
const STUDY_INDICES = INDICES.filter((x) => x.symbol !== 'MIDCPNIFTY' && x.symbol !== 'INDIAVIX');

const INTRADAY_INTERVALS = [
  { label: '5 min (last ~60 days)', value: 5, lookbackDays: 58 },
  { label: '15 min (last ~60 days)', value: 15, lookbackDays: 58 },
  { label: '1 hour (last ~2 years)', value: 60, lookbackDays: 720 },
];

const DAY = 86400000;
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
const fmtPts = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} pts`;
const condLabel = new Map(CONDITIONS.map((c) => [c.key, c.label]));

/** Short chip names for each condition key. */
const SHORT: Record<string, string> = {
  nr7: 'NR7',
  inside: 'Inside day',
  bbw_low: 'BB squeeze',
  prev_small: 'Small prev day',
  prev_big: 'Big prev day',
  prev_clean: 'Prev move clean',
  adx_high: 'ADX > 25',
  adx_low: 'ADX < 20',
  above_ema50: 'Above EMA 50',
  below_ema50: 'Below EMA 50',
  near_ema50: 'Near EMA 50',
  ema20_up: 'EMA 20 rising',
  ema20_down: 'EMA 20 falling',
  gap_up: 'Gap up',
  gap_down: 'Gap down',
  flat_open: 'Flat open',
  or_break: 'Opening range break',
  vix_high: 'VIX high',
  vix_low: 'VIX low',
  vix_rising: 'VIX rising',
  vix_falling: 'VIX falling',
  month_start: 'Month start',
  month_end: 'Month end',
};
const shortLabel = (k: string) => (k.startsWith('wd_') ? WEEKDAYS[Number(k.slice(3))] : SHORT[k] ?? k);

/** A condition is highlighted when it is this much more frequent before clean moves than usual. */
const EDGE_MIN_RATIO = 1.25;
/** ...and appears in at least this % of those clean moves... */
const EDGE_MIN_SHARE = 10;
/** ...and in at least this many of them. */
const EDGE_MIN_COUNT = 5;

interface EdgeRow {
  key: string;
  count: number;
  /** % of clean moves (in that direction) that had the condition. */
  share: number;
  /** % of all moves that had the condition. */
  baseShare: number;
  /** share ÷ baseShare. */
  ratio: number;
}

const tooltipStyle = {
  background: COLORS.panelAlt,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: COLORS.textPrimary,
};

interface Loaded {
  mode: StudyMode;
  symbol: string;
  daily: Candle[];
  intraday: Candle[];
  vix: Candle[];
  studyStart: Date;
  interval: number;
}

const MoveStudy: React.FC = () => {
  const [symbol, setSymbol] = useState(STUDY_INDICES[0].symbol);
  const [mode, setMode] = useState<StudyMode>('swing');
  const [interval, setIntervalMin] = useState(15);
  const [years, setYears] = useState(10);
  const [swingDays, setSwingDays] = useState(5);
  const [useVix, setUseVix] = useState(true);
  const [thresholds, setThresholds] = useState<CleanThresholds>(DEFAULT_THRESHOLDS.swing);
  const [onlyHolding, setOnlyHolding] = useState(false);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const changeMode = (m: StudyMode) => {
    setMode(m);
    setThresholds(DEFAULT_THRESHOLDS[m]);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const idx = STUDY_INDICES.find((x) => x.symbol === symbol)!;
      const end = new Date();
      const studyStart =
        mode === 'intraday'
          ? new Date(end.getTime() - INTRADAY_INTERVALS.find((x) => x.value === interval)!.lookbackDays * DAY)
          : new Date(end.getTime() - Math.max(1, years) * 365.25 * DAY);
      // ~400 calendar days of warm-up so ATR, ADX, EMA 50 and the 120-day Bollinger
      // percentile are all valid on the first studied day.
      const dailyStart = new Date(studyStart.getTime() - 400 * DAY);

      const [daily, intraday, vix] = await Promise.all([
        getYahooCandles({ symbol, exchange: idx.exchange, intervalInMinutes: 1440, start: dailyStart, end }),
        mode === 'intraday'
          ? getYahooCandles({ symbol, exchange: idx.exchange, intervalInMinutes: interval, start: studyStart, end })
          : Promise.resolve([] as Candle[]),
        useVix
          ? getYahooCandles({ symbol: 'INDIAVIX', exchange: 'NSE', intervalInMinutes: 1440, start: dailyStart, end }).catch(
              () => [] as Candle[]
            )
          : Promise.resolve([] as Candle[]),
      ]);
      if (daily.length < 80) throw new Error('Not enough daily history returned for this index.');
      if (mode === 'intraday' && intraday.length === 0) throw new Error('No intraday candles returned.');
      setLoaded({ mode, symbol, daily, intraday, vix, studyStart, interval });
    } catch (err) {
      setLoaded(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Re-runs instantly when you tweak thresholds or window, without re-downloading.
  const result = useMemo(() => {
    if (!loaded) return null;
    return runMoveStudy({
      mode: loaded.mode,
      daily: loaded.daily,
      intraday: loaded.intraday,
      vix: loaded.vix,
      studyStart: loaded.studyStart,
      swingDays,
      thresholds,
    });
  }, [loaded, swingDays, thresholds]);

  const chartData = useMemo(() => {
    if (!loaded || !result) return [];
    const byDay = new Map(result.units.filter((u) => u.clean).map((u) => [u.dayIndex, u]));
    const startMs = loaded.studyStart.getTime();
    return loaded.daily
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.date.getTime() >= startMs)
      .map(({ c, i }) => {
        const u = byDay.get(i);
        return {
          label: fmtDate(c.date),
          close: c.close,
          up: u && u.dir === 1 ? c.close : null,
          down: u && u.dir === -1 ? c.close : null,
        };
      });
  }, [loaded, result]);

  /**
   * Which conditions show up more often before clean moves than before moves in general.
   * "Common" alone is misleading (e.g. "above 50 EMA" is true most of the time in a bull market),
   * so a condition is highlighted only when its share among clean moves is clearly above its
   * share among all moves. Up and down moves are measured separately.
   */
  const condEdge = useMemo(() => {
    if (!result || result.baseN === 0) return null;
    const units = result.units;
    const countAll = new Map<string, number>();
    for (const u of units) for (const k of u.conditions) countAll.set(k, (countAll.get(k) ?? 0) + 1);
    const build = (dir: 1 | -1 | 0) => {
      const clean = units.filter((u) => u.clean && (dir === 0 || u.dir === dir));
      const cnt = new Map<string, number>();
      for (const u of clean) for (const k of u.conditions) cnt.set(k, (cnt.get(k) ?? 0) + 1);
      const rows: EdgeRow[] = [...cnt.entries()].map(([key, count]) => {
        const share = clean.length ? (count / clean.length) * 100 : 0;
        const baseShare = ((countAll.get(key) ?? 0) / units.length) * 100;
        return { key, count, share, baseShare, ratio: baseShare > 0 ? share / baseShare : 0 };
      });
      const edge = rows
        .filter((r) => r.count >= EDGE_MIN_COUNT && r.share >= EDGE_MIN_SHARE && r.ratio >= EDGE_MIN_RATIO)
        .sort((a, b) => b.ratio - a.ratio);
      return { total: clean.length, edge, edgeKeys: new Map(edge.map((r) => [r.key, r])) };
    };
    return { up: build(1), down: build(-1), any: build(0) };
  }, [result]);

  const heat = useMemo(() => {
    if (!result?.heatmap.length) return null;
    const hours = [...new Set(result.heatmap.map((h) => h.hour))].sort((a, b) => a - b);
    const max = Math.max(...result.heatmap.map((h) => h.cleanPct), 1);
    const get = (wd: number, h: number) => result.heatmap.find((x) => x.weekday === wd && x.hour === h);
    return { hours, max, get };
  }, [result]);

  const stats = (result?.stats ?? []).filter((s) => !onlyHolding || s.holds);
  const cleanUnits = (result?.units ?? []).filter((u) => u.clean).slice(-60).reverse();
  const cleanUp = result?.units.filter((u) => u.clean && u.dir === 1).length ?? 0;
  const cleanDown = (result?.baseClean ?? 0) - cleanUp;
  const unitWord = loaded?.mode === 'intraday' ? 'sessions' : `${swingDays}-day windows`;

  const num = (label: string, value: number, set: (n: number) => void, step: number, helper?: string) => (
    <TextField
      fullWidth
      size="small"
      type="number"
      label={label}
      value={value}
      helperText={helper}
      onChange={(e) => set(Number(e.target.value))}
      slotProps={{ htmlInput: { step, min: 0 } }}
    />
  );

  return (
    <Box>
      <Typography
        variant="h4"
        sx={{ fontWeight: 'bold', mb: 0.5, color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: 1 }}>
        <TroubleshootIcon color="primary" fontSize="large" /> Move Study
      </Typography>
      <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 3 }}>
        Find the conditions that came before clean index moves. Every move is scored, every condition known
        before the move is recorded, and each condition is compared with the base rate. The first 70% of the
        period is where an edge is found; the last 30% checks that it still works.
      </Typography>

      {/* ===== Setup ===== */}
      <Paper sx={{ ...panelSx, p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary, mb: 2 }}>
          1. What to study
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Index"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}>
              {STUDY_INDICES.map((x) => (
                <MenuItem key={x.symbol} value={x.symbol}>
                  {x.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Study unit"
              value={mode}
              onChange={(e) => changeMode(e.target.value as StudyMode)}>
              <MenuItem value="swing">Multi-day swings (daily, 10+ years)</MenuItem>
              <MenuItem value="intraday">Intraday sessions (one day each)</MenuItem>
            </TextField>
          </Grid>
          {mode === 'intraday' ? (
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                select
                size="small"
                label="Intraday bars"
                value={interval}
                onChange={(e) => setIntervalMin(Number(e.target.value))}>
                {INTRADAY_INTERVALS.map((x) => (
                  <MenuItem key={x.value} value={x.value}>
                    {x.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          ) : (
            <>
              <Grid size={{ xs: 6, md: 1.5 }}>{num('Years', years, (n) => setYears(Math.max(1, Math.round(n))), 1)}</Grid>
              <Grid size={{ xs: 6, md: 1.5 }}>
                {num('Window (days)', swingDays, (n) => setSwingDays(Math.max(2, Math.round(n))), 1)}
              </Grid>
            </>
          )}
          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={<Checkbox checked={useVix} onChange={(e) => setUseVix(e.target.checked)} size="small" />}
              label={<Typography variant="body2">Include INDIA VIX conditions</Typography>}
            />
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, mt: 3, mb: 1 }}>
          2. Your definition of a clean move
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            {num(
              'Min efficiency ratio (0–1)',
              thresholds.erMin,
              (n) => setThresholds({ ...thresholds, erMin: Math.min(1, Math.max(0, n)) }),
              0.05,
              '|net move| ÷ total distance travelled. 1 = a straight line.'
            )}
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            {num(
              'Min move (× daily ATR)',
              thresholds.moveAtrMin,
              (n) => setThresholds({ ...thresholds, moveAtrMin: Math.max(0, n) }),
              0.1,
              'Ignores clean but tiny moves.'
            )}
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            {num(
              'Max pullback (× daily ATR)',
              thresholds.pullbackAtrMax,
              (n) => setThresholds({ ...thresholds, pullbackAtrMax: Math.max(0, n) }),
              0.05,
              'Largest move against the direction.'
            )}
          </Grid>
        </Grid>

        <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            onClick={load}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}>
            {loading ? 'Loading…' : 'Run study'}
          </Button>
          {loaded && (
            <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
              Thresholds and window update the results instantly. Change the index, unit or bars and press Run
              again.
            </Typography>
          )}
        </Box>
      </Paper>

      {error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {result && loaded && (
        <>
          {result.baseN < 50 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Only {result.baseN} {unitWord} in this sample. Treat every number below as a hint, not a finding.
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard caption={`${unitWord} studied`} accent={COLORS.info} value={result.baseN} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard
                caption="Base rate (clean)"
                accent={COLORS.success}
                value={`${fmtPct(result.basePct)} (${result.baseClean})`}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard caption="Clean up / down" accent={COLORS.warning} value={`${cleanUp} / ${cleanDown}`} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard
                caption={`Base: first 70% / last 30%${result.splitDate ? ` (from ${fmtDate(result.splitDate)})` : ''}`}
                accent={COLORS.textFaint}
                value={`${fmtPct(result.inBasePct)} / ${fmtPct(result.outBasePct)}`}
              />
            </Grid>
          </Grid>

          {(result.basePct < 3 || result.basePct > 60) && (
            <Alert severity="info" sx={{ mb: 3 }}>
              {result.basePct < 3
                ? 'Very few moves pass your definition. Loosen the thresholds so there are enough clean moves to compare.'
                : 'Most moves pass your definition. Tighten the thresholds so "clean" means something.'}{' '}
              A base rate between 10% and 30% usually works best.
            </Alert>
          )}

          {/* ===== Conditions ===== */}
          <Paper sx={{ ...panelSx, p: 0, mb: 3, overflow: 'hidden' }}>
            <Box
              sx={{
                p: 2,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
              }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary }}>
                  Which conditions came before clean moves
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                  Lift = clean % with the condition minus the base rate. "Holds" = at least 30 cases in the first 70%,
                  10 in the last 30%, and the lift points the same way in both.
                </Typography>
              </Box>
              <FormControlLabel
                control={
                  <Checkbox checked={onlyHolding} onChange={(e) => setOnlyHolding(e.target.checked)} size="small" />
                }
                label={<Typography variant="body2">Only conditions that hold</Typography>}
              />
            </Box>
            <TableContainer sx={{ maxHeight: 560 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Condition</TableCell>
                    <TableCell align="right">Cases</TableCell>
                    <TableCell align="right">Clean %</TableCell>
                    <TableCell sx={{ minWidth: 160 }}>Lift vs base</TableCell>
                    <TableCell align="right">Clean up / down</TableCell>
                    <TableCell align="right">First 70%</TableCell>
                    <TableCell align="right">Last 30%</TableCell>
                    <TableCell>Holds</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.map((s) => {
                    const lc = s.liftPts >= 0 ? COLORS.success : COLORS.danger;
                    const small = s.n < 30;
                    return (
                      <TableRow key={s.key} hover sx={{ opacity: small ? 0.55 : 1 }}>
                        <TableCell sx={{ color: COLORS.textBody }}>
                          {s.label}
                          <Typography variant="caption" sx={{ display: 'block', color: COLORS.textFaint }}>
                            {s.group}
                            {small ? ' · too few cases' : ''}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textMuted }}>
                          {s.n}
                        </TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textBody, fontWeight: 600 }}>
                          {fmtPct(s.cleanPct)}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                height: 8,
                                borderRadius: 1,
                                bgcolor: lc,
                                width: `${Math.min(100, Math.abs(s.liftPts) * 3)}px`,
                              }}
                            />
                            <Typography variant="body2" sx={{ color: lc, whiteSpace: 'nowrap' }}>
                              {fmtPts(s.liftPts)}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textMuted }}>
                          {s.cleanUp} / {s.cleanDown}
                        </TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textMuted }}>
                          {fmtPct(s.inPct)}{' '}
                          <Typography component="span" variant="caption" sx={{ color: COLORS.textFaint }}>
                            ({s.inN})
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textMuted }}>
                          {fmtPct(s.outPct)}{' '}
                          <Typography component="span" variant="caption" sx={{ color: COLORS.textFaint }}>
                            ({s.outN})
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {s.holds ? (
                            <Chip size="small" label="Holds" sx={{ bgcolor: `${lc}22`, color: lc }} />
                          ) : (
                            <Typography variant="caption" sx={{ color: COLORS.textFaint }}>
                              —
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {stats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ color: COLORS.textMuted, py: 3 }}>
                        No condition passes the out-of-sample check with these settings.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* ===== Heatmap ===== */}
          {heat && (
            <Paper sx={{ ...panelSx, p: 2, mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary }}>
                Clean hours by weekday (IST)
              </Typography>
              <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block', mb: 1.5 }}>
                % of clock hours that were one-directional (|net| ≥ 60% of the hour's range) and moved at least 0.2 ×
                daily ATR. Hover a cell for the sample size.
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell />
                      {heat.hours.map((h) => (
                        <TableCell key={h} align="center" sx={{ color: COLORS.textMuted }}>
                          {`${h}:00`}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[0, 1, 2, 3, 4].map((wd) => (
                      <TableRow key={wd}>
                        <TableCell sx={{ color: COLORS.textBody, fontWeight: 600 }}>{WEEKDAYS[wd]}</TableCell>
                        {heat.hours.map((h) => {
                          const cell = heat.get(wd, h);
                          const alpha = cell ? 0.1 + 0.75 * (cell.cleanPct / heat.max) : 0;
                          return (
                            <MuiTooltip
                              key={h}
                              title={
                                cell
                                  ? `${cell.n} hours · avg directional ratio ${cell.avgDirRatio.toFixed(2)}`
                                  : 'No data'
                              }>
                              <TableCell
                                align="center"
                                sx={{
                                  bgcolor: cell ? `rgba(16,185,129,${alpha.toFixed(2)})` : 'transparent',
                                  color: COLORS.textPrimary,
                                  fontWeight: 600,
                                  border: '1px solid rgba(255,255,255,0.04)',
                                }}>
                                {cell ? fmtPct(cell.cleanPct, 0) : '—'}
                              </TableCell>
                            </MuiTooltip>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* ===== Chart ===== */}
          <Box sx={{ mb: 3 }}>
            <ChartPanel
              title={`${STUDY_INDICES.find((x) => x.symbol === loaded.symbol)?.label} · clean moves (green up, red down)`}
              accent={COLORS.info}
              height={320}
              empty={chartData.length === 0}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 11 }} minTickGap={50} />
                <YAxis
                  tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                  domain={['auto', 'auto']}
                  width={64}
                  tickFormatter={(v) => String(Math.round(Number(v)))}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => Math.round(Number(v)).toLocaleString('en-IN')} />
                <Line type="monotone" dataKey="close" name="Close" stroke={COLORS.info} strokeWidth={1.2} dot={false} isAnimationActive={false} />
                <Line dataKey="up" name="Clean up" stroke="none" isAnimationActive={false} dot={{ r: 3, fill: COLORS.success, stroke: 'none' }} activeDot={false} legendType="none" />
                <Line dataKey="down" name="Clean down" stroke="none" isAnimationActive={false} dot={{ r: 3, fill: COLORS.danger, stroke: 'none' }} activeDot={false} legendType="none" />
              </ComposedChart>
            </ChartPanel>
          </Box>

          {/* ===== Clean moves list ===== */}
          <Paper sx={{ ...panelSx, p: 0, overflow: 'hidden' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary }}>
                Most recent clean moves ({cleanUnits.length} of {result.baseClean})
              </Typography>
              {condEdge && (
                <>
                  <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block', mt: 0.5, mb: 1.5 }}>
                    Common conditions across all {result.baseClean} clean moves. A condition is starred when it appears
                    at least {EDGE_MIN_RATIO}× as often before clean moves as before moves in general (min{' '}
                    {EDGE_MIN_COUNT} cases, {EDGE_MIN_SHARE}% share). Being common alone isn't enough: "Above EMA 50"
                    is true most of the time in a rising market.
                  </Typography>
                  <Grid container spacing={2}>
                    {(
                      [
                        ['Before clean UP moves', condEdge.up, COLORS.success],
                        ['Before clean DOWN moves', condEdge.down, COLORS.danger],
                        ['Either direction', condEdge.any, COLORS.info],
                      ] as const
                    ).map(([title, e, color]) => (
                      <Grid key={title} size={{ xs: 12, md: 4 }}>
                        <Box
                          sx={{
                            p: 1.5,
                            borderRadius: 1.5,
                            border: `1px solid ${color}55`,
                            bgcolor: `${color}0d`,
                            height: '100%',
                          }}>
                          <Typography variant="subtitle2" sx={{ color, fontWeight: 700, mb: 1 }}>
                            {title} ({e.total})
                          </Typography>
                          {e.edge.length === 0 ? (
                            <Typography variant="caption" sx={{ color: COLORS.textFaint }}>
                              No condition stands out. Try a longer period or a looser clean-move definition.
                            </Typography>
                          ) : (
                            e.edge.slice(0, 8).map((r) => (
                              <MuiTooltip key={r.key} title={condLabel.get(r.key) ?? r.key} placement="left">
                                <Box sx={{ mb: 0.75 }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                    <Typography variant="body2" sx={{ color: COLORS.textPrimary, fontWeight: 600 }}>
                                      ★ {shortLabel(r.key)}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                      ×{r.ratio.toFixed(2)}
                                    </Typography>
                                  </Box>
                                  {/* Bar: share among clean moves, with a tick at the normal share. */}
                                  <Box sx={{ position: 'relative', height: 6, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.06)', mt: 0.25 }}>
                                    <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, r.share)}%`, bgcolor: color, borderRadius: 1 }} />
                                    <Box sx={{ position: 'absolute', top: -2, bottom: -2, width: 2, left: `${Math.min(100, r.baseShare)}%`, bgcolor: COLORS.textPrimary }} />
                                  </Box>
                                  <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                    {r.share.toFixed(0)}% of clean ({r.count}) vs {r.baseShare.toFixed(0)}% normally
                                  </Typography>
                                </Box>
                              </MuiTooltip>
                            ))
                          )}
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </>
              )}
            </Box>
            <TableContainer sx={{ maxHeight: 460 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Start</TableCell>
                    <TableCell>Direction</TableCell>
                    <TableCell align="right">Move</TableCell>
                    <TableCell align="right">Efficiency</TableCell>
                    <TableCell align="right">Size (ATR)</TableCell>
                    <TableCell align="right">Pullback (ATR)</TableCell>
                    <TableCell align="center">★ matches</TableCell>
                    <TableCell>Conditions before (★ = more common than usual before clean moves)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cleanUnits.map((u) => {
                    const c = u.dir === 1 ? COLORS.success : COLORS.danger;
                    const dirWord = u.dir === 1 ? 'up' : 'down';
                    const edgeKeys = condEdge ? (u.dir === 1 ? condEdge.up : condEdge.down).edgeKeys : null;
                    // Highlighted conditions first (strongest first), then the rest dimmed.
                    const matched = edgeKeys
                      ? u.conditions
                          .filter((k) => edgeKeys.has(k))
                          .sort((a, b) => edgeKeys.get(b)!.ratio - edgeKeys.get(a)!.ratio)
                      : [];
                    const others = u.conditions.filter((k) => !matched.includes(k) && !k.startsWith('wd_'));
                    return (
                      <TableRow key={u.dayIndex} hover>
                        <TableCell sx={{ color: COLORS.textBody, whiteSpace: 'nowrap' }}>{fmtDate(u.date)}</TableCell>
                        <TableCell sx={{ color: c, fontWeight: 600 }}>{u.dir === 1 ? 'Up' : 'Down'}</TableCell>
                        <TableCell align="right" sx={{ color: c }}>
                          {`${u.netPct >= 0 ? '+' : ''}${u.netPct.toFixed(2)}%`}
                        </TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textBody }}>
                          {u.er.toFixed(2)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textBody }}>
                          {u.moveAtr.toFixed(2)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: COLORS.textBody }}>
                          {u.pullbackAtr.toFixed(2)}
                        </TableCell>
                        <TableCell align="center">
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 700, color: matched.length >= 2 ? c : COLORS.textMuted }}>
                            {matched.length}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {matched.map((k) => {
                              const r = edgeKeys!.get(k)!;
                              return (
                                <MuiTooltip
                                  key={k}
                                  title={`${condLabel.get(k) ?? k} · in ${r.share.toFixed(0)}% of clean ${dirWord} moves vs ${r.baseShare.toFixed(0)}% of all moves (×${r.ratio.toFixed(2)})`}>
                                  <Chip
                                    size="small"
                                    label={`★ ${shortLabel(k)}`}
                                    sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: `${c}33`, color: c, border: `1px solid ${c}` }}
                                  />
                                </MuiTooltip>
                              );
                            })}
                            {others.map((k) => (
                              <MuiTooltip key={k} title={condLabel.get(k) ?? k}>
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={shortLabel(k)}
                                  sx={{ height: 20, fontSize: 11, opacity: 0.45 }}
                                />
                              </MuiTooltip>
                            ))}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default MoveStudy;

import React, { useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  Alert,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  IconButton,
  Tooltip as MuiTooltip,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InsightsIcon from '@mui/icons-material/Insights';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import MetricCard from '../components/MetricCard';
import ChartPanel from '../components/ChartPanel';
import { COLORS, panelSx, pnlColor } from '../lib/theme';
import { formatINR, formatSignedINR } from '../lib/format';
import { downloadReportPdf } from '../lib/reportPdf';
import {
  parseBrokerFile,
  mergeReports,
  parseBrokerDate,
  type BrokerReport,
  type BrokerTrade,
} from '../lib/brokerReport';

interface LoadedFile {
  name: string;
  report: BrokerReport;
}

const Analysis: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setLoading(true);
    setError('');
    const next: LoadedFile[] = [];
    const failed: string[] = [];
    for (const file of Array.from(list)) {
      try {
        const report = await parseBrokerFile(file);
        if (report.trades.length === 0) failed.push(`${file.name} (no trades found)`);
        else next.push({ name: file.name, report });
      } catch {
        failed.push(`${file.name} (unreadable)`);
      }
    }
    setFiles((prev) => {
      // De-dupe by file name so re-uploading the same file doesn't double it.
      const byName = new Map(prev.map((f) => [f.name, f]));
      next.forEach((f) => byName.set(f.name, f));
      return Array.from(byName.values());
    });
    if (failed.length) {
      setError(
        `Some files were skipped: ${failed.join(', ')}. Upload Groww "P&L Statement for Futures & Options" exports (.csv or .xlsx).`
      );
    }
    setLoading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));
  const clearAll = () => {
    setFiles([]);
    setError('');
  };

  // Merge all uploaded reports into one aggregated dataset.
  const report = useMemo(
    () => (files.length ? mergeReports(files.map((f) => f.report)) : null),
    [files]
  );

  // ---- Core edge metrics ----
  const stats = useMemo(() => {
    if (!report) return null;
    const t = report.trades;
    const n = t.length;
    const wins = t.filter((x) => x.realizedPnL > 0);
    const losses = t.filter((x) => x.realizedPnL < 0);
    const netPnL = t.reduce((s, x) => s + x.realizedPnL, 0);
    const grossProfit = wins.reduce((s, x) => s + x.realizedPnL, 0);
    const grossLoss = Math.abs(losses.reduce((s, x) => s + x.realizedPnL, 0));
    const winRate = n ? (wins.length / n) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const avgWin = wins.length ? grossProfit / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const expectancy = n ? netPnL / n : 0;
    const charges = report.charges.total;
    const grossAbs = Math.abs(report.realisedTotal);
    const costDragPct = grossAbs > 0 ? (charges / grossAbs) * 100 : 0;
    const sizeRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
    const bestTrade = t.reduce((m, x) => (x.realizedPnL > m ? x.realizedPnL : m), -Infinity);
    const worstTrade = t.reduce((m, x) => (x.realizedPnL < m ? x.realizedPnL : m), Infinity);
    return {
      n,
      wins: wins.length,
      losses: losses.length,
      netPnL,
      grossProfit,
      grossLoss,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      expectancy,
      costDragPct,
      sizeRatio,
      bestTrade: Number.isFinite(bestTrade) ? bestTrade : 0,
      worstTrade: Number.isFinite(worstTrade) ? worstTrade : 0,
    };
  }, [report]);

  // Chronological trades (by sell date) for the cumulative growth curve.
  const sortedTrades = useMemo(() => {
    if (!report) return [];
    return [...report.trades].sort(
      (a, b) => parseBrokerDate(a.sellDate) - parseBrokerDate(b.sellDate)
    );
  }, [report]);

  const growth = useMemo(() => {
    let running = 0;
    return sortedTrades.map((t, i) => {
      running += t.realizedPnL;
      return {
        name: `#${i + 1}`,
        label: t.scrip,
        date: t.sellDate,
        pnl: Number(t.realizedPnL.toFixed(2)),
        cumulative: Number(running.toFixed(2)),
      };
    });
  }, [sortedTrades]);

  // P&L by calendar day.
  const byDay = useMemo(() => {
    const map: Record<string, { pnl: number; ts: number; trades: number }> = {};
    (report?.trades ?? []).forEach((t) => {
      const key = (t.sellDate || t.buyDate || '').trim();
      if (!key) return;
      const ts = parseBrokerDate(key);
      if (!map[key]) map[key] = { pnl: 0, ts, trades: 0 };
      map[key].pnl += t.realizedPnL;
      map[key].trades += 1;
    });
    return Object.entries(map)
      .map(([date, v]) => ({ name: date, pnl: Number(v.pnl.toFixed(2)), trades: v.trades, ts: v.ts }))
      .sort((a, b) => a.ts - b.ts);
  }, [report]);

  // P&L by weekday (Mon–Fri).
  const byWeekday = useMemo(() => {
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const map: Record<string, { pnl: number; wins: number; trades: number }> = {};
    order.forEach((d) => (map[d] = { pnl: 0, wins: 0, trades: 0 }));
    (report?.trades ?? []).forEach((t) => {
      const ts = parseBrokerDate(t.sellDate || t.buyDate);
      if (!ts) return;
      const wd = names[new Date(ts).getDay()];
      if (!map[wd]) return;
      map[wd].pnl += t.realizedPnL;
      map[wd].trades += 1;
      if (t.realizedPnL >= 0) map[wd].wins += 1;
    });
    return order.map((name) => ({
      name,
      pnl: Number(map[name].pnl.toFixed(2)),
      trades: map[name].trades,
      winRate: map[name].trades ? Number(((map[name].wins / map[name].trades) * 100).toFixed(1)) : 0,
    }));
  }, [report]);

  // P&L by index.
  const byIndex = useMemo(() => {
    const map: Record<string, { pnl: number; wins: number; trades: number }> = {};
    (report?.trades ?? []).forEach((t) => {
      const key = t.symbol || '(unknown)';
      if (!map[key]) map[key] = { pnl: 0, wins: 0, trades: 0 };
      map[key].pnl += t.realizedPnL;
      map[key].trades += 1;
      if (t.realizedPnL >= 0) map[key].wins += 1;
    });
    return Object.entries(map)
      .map(([name, v]) => ({
        name,
        pnl: Number(v.pnl.toFixed(2)),
        trades: v.trades,
        winRate: v.trades ? Number(((v.wins / v.trades) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [report]);

  // P&L by option type (CE/PE/FUT).
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    (report?.trades ?? []).forEach((t) => {
      map[t.optionType] = (map[t.optionType] ?? 0) + t.realizedPnL;
    });
    return Object.entries(map).map(([k, v]) => ({ name: k, pnl: Number(v.toFixed(2)) }));
  }, [report]);

  const winLossPie = useMemo(
    () => (stats ? [{ name: 'Wins', value: stats.wins }, { name: 'Losses', value: stats.losses }] : []),
    [stats]
  );
  const grossPie = useMemo(
    () =>
      stats
        ? [
            { name: 'Gross Profit', value: Number(stats.grossProfit.toFixed(2)), fill: COLORS.success },
            { name: 'Gross Loss', value: Number(stats.grossLoss.toFixed(2)), fill: COLORS.danger },
          ]
        : [],
    [stats]
  );

  // Top winners / losers + concentration.
  const movers = useMemo(() => {
    if (!report) return null;
    const sorted = [...report.trades].sort((a, b) => b.realizedPnL - a.realizedPnL);
    const topWinners = sorted.filter((t) => t.realizedPnL > 0).slice(0, 5);
    const topLosers = sorted.filter((t) => t.realizedPnL < 0).slice(-5).reverse();
    const grossLoss = Math.abs(
      report.trades.filter((t) => t.realizedPnL < 0).reduce((s, t) => s + t.realizedPnL, 0)
    );
    const grossProfit = report.trades
      .filter((t) => t.realizedPnL > 0)
      .reduce((s, t) => s + t.realizedPnL, 0);
    const worst = topLosers[0] ? Math.abs(topLosers[0].realizedPnL) : 0;
    const worst3 = topLosers.slice(0, 3).reduce((s, t) => s + Math.abs(t.realizedPnL), 0);
    const best3 = topWinners.slice(0, 3).reduce((s, t) => s + t.realizedPnL, 0);
    return {
      topWinners,
      topLosers,
      worstShare: grossLoss > 0 ? (worst / grossLoss) * 100 : 0,
      worst3Share: grossLoss > 0 ? (worst3 / grossLoss) * 100 : 0,
      best3Share: grossProfit > 0 ? (best3 / grossProfit) * 100 : 0,
    };
  }, [report]);

  const dateRange = useMemo(() => {
    if (!byDay.length) return '';
    const first = byDay[0]?.name;
    const last = byDay[byDay.length - 1]?.name;
    return first === last ? first : `${first} → ${last}`;
  }, [byDay]);

  // ---- Edge & Risk analytics ----

  // Drawdown + streaks from the chronological cumulative equity curve.
  const risk = useMemo(() => {
    if (!growth.length) return null;
    let peak = 0;
    let maxDrawdown = 0; // in rupees (positive magnitude)
    let maxDrawdownPct = 0;
    for (const p of growth) {
      if (p.cumulative > peak) peak = p.cumulative;
      const dd = peak - p.cumulative;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
      }
    }
    const finalEquity = growth[growth.length - 1].cumulative;
    const currentDrawdown = Math.max(0, peak - finalEquity);

    // Consecutive win / loss streaks (by trade order).
    let curWin = 0;
    let curLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const t of sortedTrades) {
      if (t.realizedPnL > 0) {
        curWin += 1;
        curLoss = 0;
        if (curWin > longestWin) longestWin = curWin;
      } else if (t.realizedPnL < 0) {
        curLoss += 1;
        curWin = 0;
        if (curLoss > longestLoss) longestLoss = curLoss;
      } else {
        curWin = 0;
        curLoss = 0;
      }
    }

    const net = finalEquity;
    const recoveryFactor = maxDrawdown > 0 ? net / maxDrawdown : net > 0 ? Infinity : 0;

    return {
      maxDrawdown,
      maxDrawdownPct,
      currentDrawdown,
      longestWin,
      longestLoss,
      recoveryFactor,
    };
  }, [growth, sortedTrades]);

  // Holding-period buckets: P&L, win-rate and count by how long trades were held.
  const holding = useMemo(() => {
    const buckets = [
      { name: 'Same day', test: (d: number) => d <= 0 },
      { name: '1\u20132 days', test: (d: number) => d >= 1 && d <= 2 },
      { name: '3\u20135 days', test: (d: number) => d >= 3 && d <= 5 },
      { name: '6\u201315 days', test: (d: number) => d >= 6 && d <= 15 },
      { name: '15+ days', test: (d: number) => d > 15 },
    ];
    const acc = buckets.map((b) => ({ name: b.name, pnl: 0, trades: 0, wins: 0 }));
    let winnerDaysSum = 0;
    let winnerCount = 0;
    let loserDaysSum = 0;
    let loserCount = 0;
    (report?.trades ?? []).forEach((t) => {
      const buy = parseBrokerDate(t.buyDate);
      const sell = parseBrokerDate(t.sellDate);
      if (!buy || !sell) return;
      const days = Math.round((sell - buy) / 86_400_000);
      const idx = buckets.findIndex((b) => b.test(days));
      if (idx < 0) return;
      acc[idx].pnl += t.realizedPnL;
      acc[idx].trades += 1;
      if (t.realizedPnL >= 0) acc[idx].wins += 1;
      if (t.realizedPnL > 0) {
        winnerDaysSum += days;
        winnerCount += 1;
      } else if (t.realizedPnL < 0) {
        loserDaysSum += days;
        loserCount += 1;
      }
    });
    const rows = acc
      .filter((b) => b.trades > 0)
      .map((b) => ({
        name: b.name,
        pnl: Number(b.pnl.toFixed(2)),
        trades: b.trades,
        winRate: b.trades ? Number(((b.wins / b.trades) * 100).toFixed(1)) : 0,
      }));
    return {
      rows,
      avgWinnerDays: winnerCount ? winnerDaysSum / winnerCount : 0,
      avgLoserDays: loserCount ? loserDaysSum / loserCount : 0,
    };
  }, [report]);

  // Per-trade % return on invested capital (realizedPnL / buyValue), bucketed.
  const returnDist = useMemo(() => {
    const edges = [-50, -25, -10, -5, 0, 5, 10, 25, 50];
    const labels = [
      '< -50%',
      '-50 to -25%',
      '-25 to -10%',
      '-10 to -5%',
      '-5 to 0%',
      '0 to 5%',
      '5 to 10%',
      '10 to 25%',
      '25 to 50%',
      '> 50%',
    ];
    const counts = new Array(labels.length).fill(0);
    (report?.trades ?? []).forEach((t) => {
      const base = Math.abs(t.buyValue);
      if (!base) return;
      const pct = (t.realizedPnL / base) * 100;
      let bin = edges.findIndex((e) => pct < e);
      if (bin < 0) bin = labels.length - 1;
      counts[bin] += 1;
    });
    return labels
      .map((name, i) => ({ name, count: counts[i], negative: i <= 4 }))
      .filter((b) => b.count > 0);
  }, [report]);

  // Performance split by instrument type: CE vs PE vs FUT.
  const byInstrument = useMemo(() => {
    const map: Record<string, { pnl: number; trades: number; wins: number }> = {};
    (report?.trades ?? []).forEach((t) => {
      const k = t.optionType;
      if (!map[k]) map[k] = { pnl: 0, trades: 0, wins: 0 };
      map[k].pnl += t.realizedPnL;
      map[k].trades += 1;
      if (t.realizedPnL >= 0) map[k].wins += 1;
    });
    const labelMap: Record<string, string> = { CE: 'Calls (CE)', PE: 'Puts (PE)', FUT: 'Futures' };
    return Object.entries(map)
      .map(([k, v]) => ({
        name: labelMap[k] ?? k,
        pnl: Number(v.pnl.toFixed(2)),
        trades: v.trades,
        winRate: v.trades ? Number(((v.wins / v.trades) * 100).toFixed(1)) : 0,
        avgPnl: v.trades ? Number((v.pnl / v.trades).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [report]);

  const handleDownloadPdf = () => {
    if (!report || !stats) return;
    downloadReportPdf({
      report,
      stats,
      dateRange,
      byIndex,
      byDay,
      byWeekday,
      risk,
      holding,
      byInstrument,
    });
  };

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
        <InsightsIcon color="primary" fontSize="large" /> Groww F&amp;O History Analysis
      </Typography>
      <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 3 }}>
        Upload one or many Groww P&amp;L statements to analyse your full trading history. Everything
        runs in your browser — nothing is uploaded anywhere.
      </Typography>

      {/* ===== Upload ===== */}
      <Paper sx={{ ...panelSx, p: 3, mb: 3, border: `1px dashed ${COLORS.info}66` }}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          hidden
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={loading}>
            {loading ? 'Reading…' : 'Upload Groww Sheets'}
          </Button>
          {files.length > 0 && (
            <>
              <Typography variant="body2" sx={{ color: COLORS.success }}>
                {files.length} file{files.length === 1 ? '' : 's'} · {report?.trades.length} trades
                {dateRange ? ` · ${dateRange}` : ''}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                startIcon={<PictureAsPdfIcon />}
                onClick={handleDownloadPdf}>
                Download PDF
              </Button>
              <Button size="small" color="inherit" onClick={clearAll}>
                Clear all
              </Button>
            </>
          )}
        </Box>

        {files.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {files.map((f) => (
              <Chip
                key={f.name}
                label={`${f.name} (${f.report.trades.length})`}
                onDelete={() => removeFile(f.name)}
                deleteIcon={<DeleteOutlineIcon />}
                size="small"
                sx={{ bgcolor: COLORS.panelAlt, color: COLORS.textBody }}
              />
            ))}
          </Box>
        )}

        {error && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {report && stats ? (
        <>
          {/* ===== Edge metric cards ===== */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="NET P&L" value={formatSignedINR(stats.netPnL)} accent={COLORS.success} valueColor={pnlColor(stats.netPnL)} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="WIN RATE" value={`${stats.winRate.toFixed(1)}%`} accent={COLORS.info} valueColor={stats.winRate >= 50 ? COLORS.success : COLORS.danger} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="EXPECTANCY / TRADE" value={formatSignedINR(stats.expectancy)} accent={COLORS.warning} valueColor={pnlColor(stats.expectancy)} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="PROFIT FACTOR" value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)} accent={COLORS.info} valueColor={stats.profitFactor >= 1 ? COLORS.success : COLORS.danger} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="AVG WIN" value={formatINR(stats.avgWin, true)} accent={COLORS.success} valueColor={COLORS.success} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="AVG LOSS" value={formatINR(stats.avgLoss, true)} accent={COLORS.danger} valueColor={COLORS.danger} />
            </Grid>
          </Grid>

          {/* ===== Summary + quality cards ===== */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="REALISED (gross)" value={formatSignedINR(report.realisedTotal)} accent={pnlColor(report.realisedTotal)} valueColor={pnlColor(report.realisedTotal)} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="TOTAL CHARGES" value={formatINR(report.charges.total, true)} accent={COLORS.warning} valueColor={COLORS.warning} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="NET (after charges)" value={formatSignedINR(report.net)} accent={pnlColor(report.net)} valueColor={pnlColor(report.net)} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="COST DRAG" value={`${stats.costDragPct.toFixed(1)}%`} accent={COLORS.warning} valueColor={stats.costDragPct > 25 ? COLORS.danger : stats.costDragPct > 10 ? COLORS.warning : COLORS.success} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="WIN/LOSS SIZE" value={stats.sizeRatio === Infinity ? '∞' : stats.sizeRatio.toFixed(2)} accent={COLORS.info} valueColor={stats.sizeRatio >= 1 ? COLORS.success : COLORS.danger} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <MetricCard caption="TRADES" value={stats.n} accent={COLORS.info} />
            </Grid>
          </Grid>

          {/* ===== Cumulative growth curve ===== */}
          <Box sx={{ mb: 3 }}>
            <ChartPanel title="📈 Cumulative P&L (Growth Over History)" height={320} accent={COLORS.success}>
              <AreaChart data={growth} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.success} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: COLORS.textMuted }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: COLORS.textMuted }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                <Tooltip
                  formatter={(v, _n, item) => {
                    const p = (item && (item.payload as { label?: string; pnl?: number; date?: string })) || {};
                    return [`${formatSignedINR(Number(v))} (this trade ${formatSignedINR(p.pnl ?? 0)})`, `${p.label ?? ''} ${p.date ?? ''}`];
                  }}
                  contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }}
                  labelStyle={{ color: COLORS.textPrimary }}
                />
                <Area type="monotone" dataKey="cumulative" stroke={COLORS.success} strokeWidth={2} fill="url(#equityFill)" dot={false} activeDot={{ r: 5 }} />
              </AreaChart>
            </ChartPanel>
          </Box>

          {/* ===== Edge & Risk ===== */}
          <Typography variant="h6" sx={{ color: COLORS.textPrimary, fontWeight: 'bold', mb: 1.5, mt: 1 }}>
            ⚡ Edge &amp; Risk
          </Typography>

          {/* Risk metric cards */}
          {risk && (
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 6, md: 2 }}>
                <MetricCard caption="MAX DRAWDOWN" value={`-${formatINR(risk.maxDrawdown, true)}`} accent={COLORS.danger} valueColor={COLORS.danger} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <MetricCard caption="MAX DD %" value={`${risk.maxDrawdownPct.toFixed(1)}%`} accent={COLORS.danger} valueColor={risk.maxDrawdownPct > 30 ? COLORS.danger : COLORS.warning} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <MetricCard caption="CURRENT DRAWDOWN" value={risk.currentDrawdown > 0 ? `-${formatINR(risk.currentDrawdown, true)}` : '₹0'} accent={COLORS.warning} valueColor={risk.currentDrawdown > 0 ? COLORS.warning : COLORS.success} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <MetricCard caption="RECOVERY FACTOR" value={risk.recoveryFactor === Infinity ? '∞' : risk.recoveryFactor.toFixed(2)} accent={COLORS.info} valueColor={risk.recoveryFactor >= 1 ? COLORS.success : COLORS.danger} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <MetricCard caption="LONGEST WIN STREAK" value={risk.longestWin} accent={COLORS.success} valueColor={COLORS.success} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <MetricCard caption="LONGEST LOSS STREAK" value={risk.longestLoss} accent={COLORS.danger} valueColor={COLORS.danger} />
              </Grid>
            </Grid>
          )}

          {/* Holding period + instrument split */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 7 }}>
              <ChartPanel
                title="⏱️ P&L by Holding Period"
                height={280}
                accent={COLORS.info}
                empty={!holding.rows.length}
                emptyMessage="Trade dates unavailable."
                action={
                  <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                    avg winner {holding.avgWinnerDays.toFixed(1)}d · avg loser {holding.avgLoserDays.toFixed(1)}d
                  </Typography>
                }>
                <BarChart data={holding.rows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.textMuted }} />
                  <YAxis tick={{ fontSize: 11, fill: COLORS.textMuted }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip
                    formatter={(v, _n, item) => {
                      const p = (item && (item.payload as { winRate?: number; trades?: number })) || {};
                      return [`${formatSignedINR(Number(v))} · ${p.winRate ?? 0}% win · ${p.trades ?? 0} trades`, 'P&L'];
                    }}
                    contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }}
                    labelStyle={{ color: COLORS.textPrimary }}
                  />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {holding.rows.map((d) => (
                      <Cell key={d.name} fill={pnlColor(d.pnl)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartPanel>
              {holding.avgLoserDays > holding.avgWinnerDays && holding.avgWinnerDays > 0 && (
                <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                  You hold losers longer than winners ({holding.avgLoserDays.toFixed(1)}d vs {holding.avgWinnerDays.toFixed(1)}d) — a classic edge leak.
                </Alert>
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <ChartPanel
                title="🎯 By Instrument Type (CE / PE / FUT)"
                height={280}
                accent={COLORS.warning}
                empty={!byInstrument.length}
                emptyMessage="No trades.">
                <BarChart data={byInstrument} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: COLORS.textMuted }} />
                  <YAxis tick={{ fontSize: 11, fill: COLORS.textMuted }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip
                    formatter={(v, _n, item) => {
                      const p = (item && (item.payload as { winRate?: number; trades?: number; avgPnl?: number })) || {};
                      return [`${formatSignedINR(Number(v))} · ${p.winRate ?? 0}% win · ${p.trades ?? 0} trades · avg ${formatSignedINR(p.avgPnl ?? 0)}`, 'P&L'];
                    }}
                    contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }}
                    labelStyle={{ color: COLORS.textPrimary }}
                  />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {byInstrument.map((d) => (
                      <Cell key={d.name} fill={pnlColor(d.pnl)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartPanel>
            </Grid>
          </Grid>

          {/* Per-trade % return distribution */}
          <Box sx={{ mb: 3 }}>
            <ChartPanel
              title="📊 Per-Trade Return Distribution (% on capital)"
              height={280}
              accent={COLORS.info}
              empty={!returnDist.length}
              emptyMessage="Buy values unavailable for return calc.">
              <BarChart data={returnDist} margin={{ top: 8, right: 12, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: COLORS.textMuted }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.textMuted }} allowDecimals={false} />
                <Tooltip
                  formatter={(v) => [`${Number(v)} trades`, 'Count']}
                  contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }}
                  labelStyle={{ color: COLORS.textPrimary }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {returnDist.map((d) => (
                    <Cell key={d.name} fill={d.negative ? COLORS.danger : COLORS.success} />
                  ))}
                </Bar>
              </BarChart>
            </ChartPanel>
          </Box>

          {/* ===== Day-wise + Weekday ===== */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 7 }}>
              <ChartPanel title={`📅 Day-wise Profit / Loss · ${byDay.length} day${byDay.length === 1 ? '' : 's'} traded`} height={280} accent={COLORS.info} empty={!byDay.length} emptyMessage="No dates found.">
                <BarChart data={byDay} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: COLORS.textMuted }} interval={0} angle={-40} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: COLORS.textMuted }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip formatter={(v) => formatSignedINR(Number(v))} contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }} labelStyle={{ color: COLORS.textPrimary }} />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {byDay.map((d) => (
                      <Cell key={d.name} fill={pnlColor(d.pnl)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartPanel>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <ChartPanel title="🗓️ By Weekday" height={280} accent={COLORS.warning} empty={byWeekday.every((d) => d.trades === 0)} emptyMessage="No dates found.">
                <BarChart data={byWeekday} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: COLORS.textMuted }} />
                  <YAxis tick={{ fontSize: 11, fill: COLORS.textMuted }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip
                    formatter={(v, _n, item) => {
                      const p = (item && (item.payload as { winRate?: number; trades?: number })) || {};
                      return [`${formatSignedINR(Number(v))} · ${p.winRate ?? 0}% win · ${p.trades ?? 0} trades`, 'P&L'];
                    }}
                    contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }}
                    labelStyle={{ color: COLORS.textPrimary }}
                  />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {byWeekday.map((d) => (
                      <Cell key={d.name} fill={pnlColor(d.pnl)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartPanel>
            </Grid>
          </Grid>

          {/* ===== By index + by type ===== */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartPanel title="Profit / Loss by Index" height={280} accent={COLORS.success}>
                <BarChart data={byIndex} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.textMuted }} />
                  <YAxis tick={{ fontSize: 11, fill: COLORS.textMuted }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip
                    formatter={(v, _n, item) => {
                      const p = (item && (item.payload as { winRate?: number; trades?: number })) || {};
                      return [`${formatSignedINR(Number(v))} · ${p.winRate ?? 0}% win · ${p.trades ?? 0} trades`, 'P&L'];
                    }}
                    contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }}
                    labelStyle={{ color: COLORS.textPrimary }}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {byIndex.map((d) => (
                      <Cell key={d.name} fill={pnlColor(d.pnl)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartPanel>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartPanel title="Profit / Loss by Option Type" height={280} accent={COLORS.info}>
                <BarChart data={byType} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: COLORS.textMuted }} />
                  <YAxis tick={{ fontSize: 11, fill: COLORS.textMuted }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Tooltip formatter={(v) => formatSignedINR(Number(v))} contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }} labelStyle={{ color: COLORS.textPrimary }} />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {byType.map((d) => (
                      <Cell key={d.name} fill={pnlColor(d.pnl)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartPanel>
            </Grid>
          </Grid>

          {/* ===== Win/loss pies ===== */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartPanel title={`Wins vs Losses · ${stats.wins}W / ${stats.losses}L`} height={280} accent={COLORS.success}>
                <PieChart>
                  <Pie data={winLossPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} label={(e: { name?: string; value?: number }) => `${e.name}: ${e.value}`}>
                    <Cell fill={COLORS.success} />
                    <Cell fill={COLORS.danger} />
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }} />
                </PieChart>
              </ChartPanel>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartPanel title={`Gross Profit vs Loss · Net ${formatSignedINR(stats.netPnL)}`} height={280} accent={COLORS.info}>
                <PieChart>
                  <Pie data={grossPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} label={(e: { name?: string; value?: number }) => `${e.name}: ${formatINR(Number(e.value ?? 0), true)}`}>
                    {grossPie.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatINR(Number(v), true)} contentStyle={{ background: COLORS.panelAlt, border: 'none', borderRadius: 8 }} />
                </PieChart>
              </ChartPanel>
            </Grid>
          </Grid>

          {/* ===== Winners / losers ===== */}
          {movers && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ ...panelSx, p: 2, height: '100%' }}>
                  <Typography variant="subtitle2" sx={{ color: COLORS.success, fontWeight: 'bold', mb: 1 }}>
                    ✅ Top Winners
                    <Typography component="span" variant="caption" sx={{ color: COLORS.textMuted, ml: 1 }}>
                      top 3 = {movers.best3Share.toFixed(0)}% of all profit
                    </Typography>
                  </Typography>
                  {movers.topWinners.length ? (
                    movers.topWinners.map((t, i) => (
                      <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <Typography variant="body2" sx={{ color: COLORS.textBody }} noWrap>{t.scrip}</Typography>
                        <Typography variant="body2" sx={{ color: COLORS.success, fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatSignedINR(t.realizedPnL)}</Typography>
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body2" sx={{ color: COLORS.textMuted }}>No winning trades.</Typography>
                  )}
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ ...panelSx, p: 2, height: '100%' }}>
                  <Typography variant="subtitle2" sx={{ color: COLORS.danger, fontWeight: 'bold', mb: 1 }}>
                    ⚠️ Biggest Losers
                    <Typography component="span" variant="caption" sx={{ color: COLORS.textMuted, ml: 1 }}>
                      top 3 = {movers.worst3Share.toFixed(0)}% of all loss
                    </Typography>
                  </Typography>
                  {movers.topLosers.length ? (
                    movers.topLosers.map((t, i) => (
                      <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <Typography variant="body2" sx={{ color: COLORS.textBody }} noWrap>{t.scrip}</Typography>
                        <Typography variant="body2" sx={{ color: COLORS.danger, fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatSignedINR(t.realizedPnL)}</Typography>
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body2" sx={{ color: COLORS.textMuted }}>No losing trades.</Typography>
                  )}
                  {movers.topLosers.length > 0 && movers.worstShare >= 40 && (
                    <Alert severity="warning" sx={{ mt: 1.5, py: 0 }}>
                      Your single worst trade is {movers.worstShare.toFixed(0)}% of total loss — one trade is dominating.
                    </Alert>
                  )}
                </Paper>
              </Grid>
            </Grid>
          )}

          {/* ===== Trade table ===== */}
          <Paper sx={{ ...panelSx, overflow: 'hidden' }}>
            <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary }}>
                All Trades ({report.trades.length})
              </Typography>
            </Box>
            <TableContainer sx={{ maxHeight: '55vh' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {['Scrip', 'Type', 'Qty', 'Buy', 'Sell', 'Sell Date', 'Realized P&L'].map((h) => (
                      <TableCell
                        key={h}
                        sx={{
                          bgcolor: COLORS.panelAlt,
                          color: COLORS.textMuted,
                          fontWeight: 'bold',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                          textAlign: h === 'Realized P&L' || h === 'Qty' ? 'right' : 'left',
                        }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedTrades.map((t: BrokerTrade, i) => (
                    <TableRow key={i} hover>
                      <TableCell sx={{ color: COLORS.textBody, whiteSpace: 'nowrap' }}>{t.scrip}</TableCell>
                      <TableCell>
                        <Chip
                          label={t.optionType}
                          size="small"
                          sx={{
                            fontWeight: 'bold',
                            fontSize: '0.65rem',
                            color: t.optionType === 'PE' ? COLORS.danger : t.optionType === 'CE' ? COLORS.success : COLORS.info,
                            bgcolor: 'rgba(255,255,255,0.05)',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: COLORS.textBody, textAlign: 'right' }}>{t.quantity}</TableCell>
                      <TableCell sx={{ color: COLORS.textMuted }}>{t.buyPrice}</TableCell>
                      <TableCell sx={{ color: COLORS.textMuted }}>{t.sellPrice}</TableCell>
                      <TableCell sx={{ color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{t.sellDate}</TableCell>
                      <TableCell sx={{ textAlign: 'right', fontWeight: 'bold', color: pnlColor(t.realizedPnL), whiteSpace: 'nowrap' }}>
                        {formatSignedINR(t.realizedPnL)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      ) : (
        <Paper sx={{ ...panelSx, p: 6, textAlign: 'center' }}>
          <MuiTooltip title="Upload to begin">
            <IconButton onClick={() => inputRef.current?.click()} sx={{ color: COLORS.info, mb: 1 }}>
              <UploadFileIcon fontSize="large" />
            </IconButton>
          </MuiTooltip>
          <Typography variant="body1" sx={{ color: COLORS.textMuted }}>
            Upload your Groww P&amp;L statements to see your historical analytics.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default Analysis;

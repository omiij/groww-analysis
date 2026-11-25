import type React from 'react';
import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  TextField,
  MenuItem,
  Grid,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Chip,
  CircularProgress,
} from '@mui/material';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import DownloadIcon from '@mui/icons-material/Download';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import ChartPanel from '../components/ChartPanel';
import { COLORS, panelSx } from '../lib/theme';
import { formatINR } from '../lib/format';
import {
  getHistoricalCandles,
  datetimeLocalToApiTime,
  toApiTime,
  type Candle,
  type Exchange,
  type Segment,
} from '../lib/growwApi';

const EXCHANGES: Exchange[] = ['NSE', 'BSE'];
const SEGMENTS: Segment[] = ['CASH', 'FNO'];
const INTERVALS = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
  { label: '1 day', value: 1440 },
  { label: '1 week', value: 10080 },
];

/** Default to a datetime-local value N hours before now. */
function defaultLocal(offsetHours: number): string {
  const d = new Date(Date.now() - offsetHours * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

const labelForTs = (date: Date, intervalMin: number): string => {
  // Intraday intervals show time; daily+ show date.
  if (intervalMin > 0 && intervalMin < 1440) {
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

const HistoricalData: React.FC = () => {
  const [tradingSymbol, setTradingSymbol] = useState('RELIANCE');
  const [exchange, setExchange] = useState<Exchange>('NSE');
  const [segment, setSegment] = useState<Segment>('CASH');
  const [interval, setInterval] = useState<number>(60);
  const [startLocal, setStartLocal] = useState(() => defaultLocal(24 * 7)); // last 7 days
  const [endLocal, setEndLocal] = useState(() => defaultLocal(0));

  const [candles, setCandles] = useState<Candle[]>([]);
  const [meta, setMeta] = useState<{ start: string; end: string; interval: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const start = datetimeLocalToApiTime(startLocal);
      const end = datetimeLocalToApiTime(endLocal);
      if (!tradingSymbol.trim()) throw new Error('Enter a trading symbol.');
      if (!start || !end) throw new Error('Pick a start and end time.');

      const result = await getHistoricalCandles({
        tradingSymbol: tradingSymbol.trim().toUpperCase(),
        exchange,
        segment,
        startTime: start,
        endTime: end,
        intervalInMinutes: interval,
      });
      setCandles(result.candles);
      setMeta({
        start: result.startTime,
        end: result.endTime,
        interval: result.intervalInMinutes,
      });
      if (result.candles.length === 0) {
        setError('No candles returned for this range. Try a wider range or different interval.');
      }
    } catch (err) {
      setCandles([]);
      setMeta(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(
    () =>
      candles.map((c) => ({
        label: labelForTs(c.date, meta?.interval ?? interval),
        close: c.close,
        high: c.high,
        low: c.low,
      })),
    [candles, meta, interval]
  );

  const summary = useMemo(() => {
    if (candles.length === 0) return null;
    const first = candles[0];
    const last = candles[candles.length - 1];
    const highest = Math.max(...candles.map((c) => c.high));
    const lowest = Math.min(...candles.map((c) => c.low));
    const change = last.close - first.open;
    const changePct = first.open !== 0 ? (change / first.open) * 100 : 0;
    const totalVolume = candles.reduce((s, c) => s + (c.volume || 0), 0);
    return { first, last, highest, lowest, change, changePct, totalVolume };
  }, [candles]);

  const downloadCsv = () => {
    const header = 'timestamp,datetime,open,high,low,close,volume';
    const rows = candles.map(
      (c) =>
        `${c.timestamp},${toApiTime(c.date)},${c.open},${c.high},${c.low},${c.close},${c.volume}`
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tradingSymbol.toUpperCase()}_${exchange}_${interval}min.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        <CandlestickChartIcon color="primary" fontSize="large" /> Historical Data
      </Typography>
      <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 3 }}>
        Fetch historical OHLCV candles from the Groww API. Requests are proxied through the dev
        server so your token stays private.
      </Typography>

      {/* ===== Query form ===== */}
      <Paper sx={{ ...panelSx, p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              label="Trading Symbol"
              value={tradingSymbol}
              onChange={(e) => setTradingSymbol(e.target.value)}
              placeholder="RELIANCE"
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField
              fullWidth
              select
              label="Exchange"
              value={exchange}
              onChange={(e) => setExchange(e.target.value as Exchange)}
              size="small">
              {EXCHANGES.map((x) => (
                <MenuItem key={x} value={x}>
                  {x}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField
              fullWidth
              select
              label="Segment"
              value={segment}
              onChange={(e) => setSegment(e.target.value as Segment)}
              size="small">
              {SEGMENTS.map((x) => (
                <MenuItem key={x} value={x}>
                  {x}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              fullWidth
              select
              label="Interval"
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              size="small">
              {INTERVALS.map((x) => (
                <MenuItem key={x.value} value={x.value}>
                  {x.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              type="datetime-local"
              label="Start"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              type="datetime-local"
              label="End"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CandlestickChartIcon />}
                onClick={fetchData}
                disabled={loading}>
                {loading ? 'Fetching…' : 'Fetch Candles'}
              </Button>
              {candles.length > 0 && (
                <>
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<DownloadIcon />}
                    onClick={downloadCsv}>
                    Download CSV
                  </Button>
                  <Chip
                    label={`${candles.length} candles`}
                    size="small"
                    sx={{ bgcolor: `${COLORS.info}22`, color: COLORS.info }}
                  />
                </>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* ===== Summary ===== */}
      {summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ ...panelSx, p: 2 }}>
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                Close
              </Typography>
              <Typography variant="h6" sx={{ color: COLORS.textPrimary }}>
                {formatINR(summary.last.close, true)}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ ...panelSx, p: 2 }}>
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                Change (range)
              </Typography>
              <Typography
                variant="h6"
                sx={{ color: summary.change >= 0 ? COLORS.success : COLORS.danger }}>
                {summary.change >= 0 ? '+' : ''}
                {formatINR(summary.change, true)} ({summary.changePct.toFixed(2)}%)
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ ...panelSx, p: 2 }}>
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                High / Low
              </Typography>
              <Typography variant="h6" sx={{ color: COLORS.textPrimary }}>
                {formatINR(summary.highest, true)} / {formatINR(summary.lowest, true)}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ ...panelSx, p: 2 }}>
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                Total Volume
              </Typography>
              <Typography variant="h6" sx={{ color: COLORS.textPrimary }}>
                {summary.totalVolume.toLocaleString('en-IN')}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* ===== Chart ===== */}
      {candles.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <ChartPanel title="Close Price" accent={COLORS.info} height={320}>
            <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="closeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.info} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={COLORS.info} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                minTickGap={32}
              />
              <YAxis
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                domain={['auto', 'auto']}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  background: COLORS.panelAlt,
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: COLORS.textPrimary,
                }}
                formatter={(v) => formatINR(Number(v), true)}
              />
              {summary && (
                <ReferenceLine
                  y={summary.first.open}
                  stroke={COLORS.textFaint}
                  strokeDasharray="4 4"
                />
              )}
              <Area
                type="monotone"
                dataKey="close"
                stroke={COLORS.info}
                strokeWidth={2}
                fill="url(#closeFill)"
              />
            </AreaChart>
          </ChartPanel>
        </Box>
      )}

      {/* ===== Candle table ===== */}
      {candles.length > 0 && (
        <Paper sx={{ ...panelSx, p: 0, overflow: 'hidden' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary }}>
              Candles
            </Typography>
            {meta && (
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                {meta.start} → {meta.end} · {meta.interval} min interval
              </Typography>
            )}
          </Box>
          <TableContainer sx={{ maxHeight: 420 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell align="right">Open</TableCell>
                  <TableCell align="right">High</TableCell>
                  <TableCell align="right">Low</TableCell>
                  <TableCell align="right">Close</TableCell>
                  <TableCell align="right">Volume</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {candles.map((c) => (
                  <TableRow key={c.timestamp} hover>
                    <TableCell sx={{ color: COLORS.textBody, whiteSpace: 'nowrap' }}>
                      {labelForTs(c.date, meta?.interval ?? interval)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: COLORS.textBody }}>
                      {formatINR(c.open, true)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: COLORS.success }}>
                      {formatINR(c.high, true)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: COLORS.danger }}>
                      {formatINR(c.low, true)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: COLORS.textPrimary, fontWeight: 600 }}>
                      {formatINR(c.close, true)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: COLORS.textMuted }}>
                      {(c.volume || 0).toLocaleString('en-IN')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default HistoricalData;

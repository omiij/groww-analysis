import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  TextField,
  MenuItem,
  Chip,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RefreshIcon from '@mui/icons-material/Refresh';
import { COLORS, panelSx } from '../lib/theme';
import { formatINR } from '../lib/format';
import { getOrderList, type GrowwOrder, type Segment } from '../lib/growwApi';

const SEGMENTS: Segment[] = ['CASH', 'FNO'];

/** Map an order status to a theme colour. */
const statusColor = (status: string): string => {
  const s = status.toUpperCase();
  if (s.includes('EXECUT') || s.includes('COMPLETE') || s === 'FILLED') return COLORS.success;
  if (s.includes('CANCEL') || s.includes('REJECT') || s.includes('FAIL')) return COLORS.danger;
  if (s.includes('OPEN') || s.includes('PENDING') || s.includes('NEW')) return COLORS.warning;
  return COLORS.textMuted;
};

const txnColor = (txn: string): string =>
  txn.toUpperCase() === 'BUY' ? COLORS.success : COLORS.danger;

/** Best-effort parse of an order's timestamp into a Date (or null). */
const orderDate = (o: GrowwOrder): Date | null => {
  const raw = o.exchangeTime || o.createdAt || o.tradeDate || '';
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Local yyyy-MM-dd for a Date. */
const toInputDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const Orders: React.FC = () => {
  const [segment, setSegment] = useState<Segment>('CASH');
  const [orders, setOrders] = useState<GrowwOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Date range filter (applied client-side — see note in the UI).
  const today = toInputDate(new Date());
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const fetchOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await getOrderList({ segment, page: 0, pageSize: 100 });
      setOrders(list);
      setLoaded(true);
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Fetch on first mount and whenever the segment changes.
  useEffect(() => {
    void fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment]);

  // Orders whose timestamp falls within [fromDate, toDate] (inclusive).
  const filteredOrders = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;
    return orders.filter((o) => {
      const d = orderDate(o);
      if (!d) return true; // keep undated rows rather than hide them
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [orders, fromDate, toDate]);

  const summary = useMemo(() => {
    if (!filteredOrders.length) return null;
    const executed = filteredOrders.filter((o) => statusColor(o.orderStatus) === COLORS.success).length;
    const open = filteredOrders.filter((o) => statusColor(o.orderStatus) === COLORS.warning).length;
    const cancelled = filteredOrders.filter((o) => statusColor(o.orderStatus) === COLORS.danger).length;
    const buys = filteredOrders.filter((o) => o.transactionType.toUpperCase() === 'BUY').length;
    const sells = filteredOrders.filter((o) => o.transactionType.toUpperCase() === 'SELL').length;
    return { total: filteredOrders.length, executed, open, cancelled, buys, sells };
  }, [filteredOrders]);

  const setRangeDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    setFromDate(toInputDate(start));
    setToDate(toInputDate(end));
  };

  const hidden = orders.length - filteredOrders.length;

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
        <ReceiptLongIcon color="primary" fontSize="large" /> Orders
      </Typography>
      <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 2 }}>
        Order book from the Groww API — open, pending and executed orders. Requests are proxied
        through the dev server so your token stays private.
      </Typography>

      {/* The Groww order-list API only serves the current day; the date range
          filters the returned set client-side. */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Groww&apos;s order API only returns the <strong>current day&apos;s</strong> orders — it has
        no date parameter. The date range below filters those results on the client. To analyse
        older history, use the <strong>Analysis</strong> page with your P&amp;L statements.
      </Alert>

      {/* ===== Controls ===== */}
      <Paper sx={{ ...panelSx, p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            select
            label="Segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value as Segment)}
            size="small"
            sx={{ minWidth: 120 }}>
            {SEGMENTS.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="date"
            label="From"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            label="To"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button size="small" variant="text" onClick={() => setRangeDays(1)}>
              Today
            </Button>
            <Button size="small" variant="text" onClick={() => setRangeDays(7)}>
              7D
            </Button>
            <Button size="small" variant="text" onClick={() => setRangeDays(30)}>
              30D
            </Button>
          </Box>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={fetchOrders}
            disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </Box>

        {summary && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
            <Chip size="small" label={`${summary.total} orders`} sx={{ bgcolor: `${COLORS.info}22`, color: COLORS.info }} />
            <Chip size="small" label={`${summary.executed} executed`} sx={{ bgcolor: `${COLORS.success}22`, color: COLORS.success }} />
            <Chip size="small" label={`${summary.open} open`} sx={{ bgcolor: `${COLORS.warning}22`, color: COLORS.warning }} />
            <Chip size="small" label={`${summary.cancelled} cancelled`} sx={{ bgcolor: `${COLORS.danger}22`, color: COLORS.danger }} />
            <Chip size="small" label={`${summary.buys}B / ${summary.sells}S`} sx={{ bgcolor: COLORS.panelAlt, color: COLORS.textBody }} />
            {hidden > 0 && (
              <Chip size="small" label={`${hidden} outside range`} sx={{ bgcolor: COLORS.panelAlt, color: COLORS.textFaint }} />
            )}
          </Box>
        )}
      </Paper>

      {error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* ===== Orders table ===== */}
      {filteredOrders.length > 0 ? (
        <Paper sx={{ ...panelSx, p: 0, overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 560 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Side</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Qty (filled/total)</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Avg Fill</TableCell>
                  <TableCell>Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredOrders.map((o) => (
                  <TableRow key={o.growwOrderId || `${o.tradingSymbol}-${o.createdAt}`} hover>
                    <TableCell sx={{ color: COLORS.textPrimary, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {o.tradingSymbol}
                    </TableCell>
                    <TableCell sx={{ color: txnColor(o.transactionType), fontWeight: 600 }}>
                      {o.transactionType}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={o.orderStatus}
                        sx={{
                          bgcolor: `${statusColor(o.orderStatus)}22`,
                          color: statusColor(o.orderStatus),
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: COLORS.textBody }}>{o.orderType}</TableCell>
                    <TableCell sx={{ color: COLORS.textBody }}>{o.product}</TableCell>
                    <TableCell align="right" sx={{ color: COLORS.textBody }}>
                      {o.filledQuantity}/{o.quantity}
                    </TableCell>
                    <TableCell align="right" sx={{ color: COLORS.textBody }}>
                      {o.price ? formatINR(o.price, true) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ color: COLORS.textPrimary }}>
                      {o.averageFillPrice ? formatINR(o.averageFillPrice, true) : '—'}
                    </TableCell>
                    <TableCell sx={{ color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                      {o.exchangeTime || o.createdAt || o.tradeDate || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ) : (
        !loading &&
        loaded &&
        !error && (
          <Paper sx={{ ...panelSx, p: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: COLORS.textMuted, fontStyle: 'italic' }}>
              {orders.length === 0
                ? `No orders found for ${segment} today.`
                : `No ${segment} orders in the selected date range (${fromDate} → ${toDate}).`}
            </Typography>
          </Paper>
        )
      )}
    </Box>
  );
};

export default Orders;

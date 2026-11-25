import type React from 'react';
import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from 'recharts';
import ChartPanel from './ChartPanel';
import { COLORS } from '../lib/theme';
import { formatINR } from '../lib/format';
import type { Candle } from '../lib/growwApi';

interface Props {
  candles: Candle[];
  title: React.ReactNode;
  /** Format a candle date for the x axis and tooltip. */
  formatLabel: (d: Date) => string;
}

interface Row {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  range: [number, number];
}

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Row;
}

/** Draws one candle (wick + body) inside the bar's low..high pixel box. */
const CandleShape: React.FC<ShapeProps> = ({ x = 0, y = 0, width = 0, height = 0, payload }) => {
  if (!payload) return null;
  const { open, close, high, low } = payload;
  const up = close >= open;
  const color = up ? COLORS.success : COLORS.danger;
  const span = high - low;
  const px = (price: number) => (span === 0 ? y : y + ((high - price) / span) * height);
  const bodyTop = px(Math.max(open, close));
  const bodyBottom = px(Math.min(open, close));
  const bodyH = Math.max(1, bodyBottom - bodyTop);
  const bodyW = Math.max(1, width * 0.7);
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
    </g>
  );
};

const tooltipStyle = {
  background: COLORS.panelAlt,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: COLORS.textPrimary,
};

const CandleTooltip: React.FC<{ active?: boolean; payload?: { payload: Row }[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div style={{ ...tooltipStyle, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.label}</div>
      <div>O {formatINR(r.open, true)}</div>
      <div>H {formatINR(r.high, true)}</div>
      <div>L {formatINR(r.low, true)}</div>
      <div>C {formatINR(r.close, true)}</div>
      <div>Vol {r.volume.toLocaleString('en-IN')}</div>
    </div>
  );
};

/** Candlestick chart with a volume panel underneath. */
const CandleChart: React.FC<Props> = ({ candles, title, formatLabel }) => {
  const rows = useMemo<Row[]>(
    () =>
      candles.map((c) => ({
        label: formatLabel(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        range: [c.low, c.high],
      })),
    [candles, formatLabel]
  );

  const axis = { fill: COLORS.textMuted, fontSize: 11 };

  return (
    <>
      <ChartPanel title={title} accent={COLORS.info} height={340} empty={rows.length === 0}>
        <ComposedChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={axis} minTickGap={40} />
          <YAxis
            tick={axis}
            domain={['dataMin', 'dataMax']}
            width={64}
            tickFormatter={(v) => String(Math.round(Number(v)))}
          />
          <Tooltip content={<CandleTooltip />} />
          <Bar dataKey="range" shape={<CandleShape />} isAnimationActive={false} />
        </ComposedChart>
      </ChartPanel>
      <ChartPanel title="Volume" height={120} empty={rows.length === 0}>
        <ComposedChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={axis} minTickGap={40} />
          <YAxis tick={axis} width={64} tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(0)}M`} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => Number(v).toLocaleString('en-IN')}
          />
          <Bar
            dataKey="volume"
            name="Volume"
            fill={COLORS.info}
            fillOpacity={0.6}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartPanel>
    </>
  );
};

export default CandleChart;

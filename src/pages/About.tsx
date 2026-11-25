import type React from 'react';
import type { ComponentType } from 'react';
import { Box, Chip, Grid, Paper, Typography } from '@mui/material';
import type { SvgIconProps } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import ScienceIcon from '@mui/icons-material/Science';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CodeIcon from '@mui/icons-material/Code';
import { COLORS, panelSx } from '../lib/theme';

interface Feature {
  title: string;
  tagline: string;
  icon: ComponentType<SvgIconProps>;
  color: string;
  points: string[];
}

const FEATURES: Feature[] = [
  {
    title: 'Analysis',
    tagline: 'Turn a Groww P&L statement into a full performance review.',
    icon: InsightsIcon,
    color: COLORS.success,
    points: [
      'Upload one or many Groww F&O P&L statements (.csv or .xlsx). Overlapping files are de-duplicated.',
      'Edge metrics: net P&L, win rate, expectancy per trade, profit factor, average win vs loss, and cost drag from charges.',
      'Cumulative P&L curve plus day-wise, weekday, index and CE / PE / futures breakdowns.',
      'Risk: max and current drawdown, recovery factor, and longest win and loss streaks.',
      'Behaviour checks: P&L by holding period, per-trade return distribution, and concentration in your best and worst trades.',
      'Download the whole review as a PDF report, including a trade-by-trade table with buy and sell prices.',
    ],
  },
  {
    title: 'Historical Data',
    tagline: 'Pull past candles for any instrument and inspect them.',
    icon: CandlestickChartIcon,
    color: COLORS.info,
    points: [
      'Choose symbol, exchange, segment, candle interval (1 minute to 1 week) and a date range.',
      'Price chart with range change, high and low, and total volume.',
      'Full candle table (open, high, low, close, volume) with CSV export.',
    ],
  },
  {
    title: 'Backtesting',
    tagline: 'Test a rule-based strategy on historical candles.',
    icon: ScienceIcon,
    color: COLORS.warning,
    points: [
      'Stocks and indices from Yahoo Finance or the Groww API, on daily or intraday candles.',
      'Start from a template or build your own entry and exit rules from SMA, EMA, RSI, ATR, Bollinger Bands and MACD.',
      'Templates include an EMA 50 breakout, an EMA 50 trend follower with pyramiding, SMA and EMA crossovers, RSI mean reversion, Bollinger bounce and MACD.',
      'Risk modes: percent stop loss and take profit, candle-range stop with a reward-to-risk target, or ATR pyramiding with a trailing stop.',
      'Realistic fills: signals on the bar close, orders filled at the next open, with commission and slippage.',
      'Results show net profit against buy and hold, max drawdown, Sharpe ratio, win rate, profit factor, time in market, and every trade.',
    ],
  },
  {
    title: 'Move Study',
    tagline: 'Find what tends to happen before a clean market move.',
    icon: TroubleshootIcon,
    color: '#a78bfa',
    points: [
      'Scores each intraday session or multi-day swing as clean or not, using efficiency ratio, size relative to ATR, and the deepest pullback.',
      'Records what was already true before each move, such as ADX, position against the 50 EMA, EMA slope, Bollinger width, gaps and India VIX.',
      'Compares each condition with the base rate to show its lift, and checks it on a held-back last 30% of the data so a pattern has to hold up out of sample.',
      'A weekday and hour heatmap shows when clean moves happen most often.',
    ],
  },
];

const STACK = ['React', 'TypeScript', 'Vite', 'Material UI', 'Recharts'];

const About: React.FC = () => {
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
        <InfoOutlinedIcon color="primary" fontSize="large" /> About
      </Typography>
      <Typography variant="body1" sx={{ color: COLORS.textMuted, mb: 4, maxWidth: 820 }}>
        A toolkit for analysing Indian F&amp;O trading: review your own history, study the market,
        and test strategy ideas before risking money on them.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <Grid key={f.title} size={{ xs: 12, md: 6 }}>
              <Paper
                sx={{
                  ...panelSx,
                  p: 3,
                  height: '100%',
                  borderTop: `4px solid ${f.color}`,
                }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Icon sx={{ fontSize: 34, color: f.color }} />
                  <Typography variant="h5" sx={{ fontWeight: 'bold', color: COLORS.textPrimary }}>
                    {f.title}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 1.5 }}>
                  {f.tagline}
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, color: COLORS.textBody }}>
                  {f.points.map((p) => (
                    <Typography key={p} component="li" variant="body2" sx={{ mb: 0.75 }}>
                      {p}
                    </Typography>
                  ))}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ ...panelSx, p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <LockOutlinedIcon sx={{ color: COLORS.success }} />
              <Typography variant="h6" sx={{ color: COLORS.textPrimary }}>
                Your statements stay with you
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: COLORS.textBody }}>
              The Analysis page reads your statement files entirely in the browser. They are parsed
              on your device and are never uploaded to a server.
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ ...panelSx, p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <CodeIcon sx={{ color: COLORS.info }} />
              <Typography variant="h6" sx={{ color: COLORS.textPrimary }}>
                Built with
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {STACK.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  size="small"
                  sx={{ bgcolor: COLORS.panelAlt, color: COLORS.textBody }}
                />
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default About;

# Groww F&O Analysis

A browser-based toolkit for analysing Indian F&O trading. Review your own trade history from Groww P&L statements, pull historical candles, backtest rule-based strategies, and study what tends to come before clean market moves.

Built with React, TypeScript, Vite, Material UI and Recharts.

## Features

| Page                | What it does                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Analysis**        | Upload one or more Groww F&O P&L statements (`.csv` / `.xlsx`). Get win rate, expectancy, profit factor, cost drag, an equity curve, drawdown and streaks, P&L by day / weekday / index / CE-PE-FUT / holding period, a return distribution, and a downloadable PDF report.                                                                      |
| **Historical Data** | Fetch OHLCV candles (1 minute to 1 week) for a symbol and date range. Price chart, summary stats, candle table and CSV export.                                                                                                                                                                                                                   |
| **Backtesting**     | Test a strategy on stocks or indices. Use a template (EMA 50 breakout, EMA 50 trend with pyramiding, EMA / SMA crossovers, RSI mean reversion, Bollinger bounce, MACD) or build your own rules. Fills at the next bar's open with commission and slippage. Reports net profit vs buy and hold, drawdown, Sharpe ratio, win rate and every trade. |
| **Move Study**      | Scores each session or swing as a "clean" move, records the conditions known beforehand (ADX, EMA position and slope, Bollinger width, gaps, India VIX), and checks which ones beat the base rate on a held-back last 30% of the data. Includes a weekday / hour heatmap.                                                                        |
| **About**           | Short description of the above.                                                                                                                                                                                                                                                                                                                  |

Your statements are parsed entirely in the browser. They are never uploaded anywhere.

## Quick start

Requires a current Node.js LTS release.

```bash
npm install
npm run dev
```

Open http://localhost:3100.

To try the Analysis page without your own data, upload `sample-data/dummy-groww-pnl.xlsx` (24 made-up trades). To regenerate it with different trades, edit and run:

```bash
node sample-data/make-dummy-xlsx.cjs
```

### Scripts

| Command           | What it does                      |
| ----------------- | --------------------------------- |
| `npm run dev`     | Start the dev server on port 3100 |
| `npm run build`   | Type-check, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally   |

## Configuration

Copy `.env.example` to `.env`.

| Variable               | Purpose                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_GROWW_API_TOKEN` | Groww API access token. Only needed for the Groww data source. Tokens expire daily at 6:00 AM, so regenerate and restart the dev server. |
| `VITE_PRIVATE_PAGES`   | Set to `true` in `.env.development` (local only) to register extra personal pages. Leave unset for any public build.                     |

`.env` and `.env.*` are git-ignored. Never commit a real token.

## How data fetching works

The browser can't call Yahoo Finance or the Groww API directly (CORS, and the Groww token must stay secret). In development, `vite.config.ts` runs two proxies:

- `/yahoo-api` forwards to Yahoo Finance (free, no key). This is the default backtest source.
- `/groww-api` forwards to `api.groww.in` and adds the `Authorization` header from `.env`, so the token never reaches the browser bundle.

**These proxies exist only on the Vite dev server.** A static deployment has no `/yahoo-api` or `/groww-api`, so Historical Data, Backtesting and Move Study cannot load market data there. The Analysis page works on any static host because it only reads uploaded files. To deploy the data pages, put an equivalent proxy in front of them (a serverless function or reverse proxy that forwards those two paths).

The Groww historical-candle endpoint also needs an API subscription whose token includes market-data permission. A token limited to orders and portfolio gets `403`.

## Project structure

```
src/
  main.tsx, App.tsx          App entry and theme
  components/                NavBar, Layout, charts, metric cards, rule editor
  pages/
    registry.tsx             Single list of pages. Add a page by adding one entry.
    Analysis.tsx, HistoricalData.tsx, Backtesting.tsx, MoveStudy.tsx, About.tsx
  lib/
    brokerReport.ts          Parses Groww P&L statements into trades and charges
    reportPdf.ts             Builds the printable PDF report
    growwApi.ts, yahooApi.ts Market-data clients
    moveStudy.ts             Move scoring and condition statistics
    backtest/                Engine, indicators, signal strategies, presets
    router.tsx               Small hash router (no router dependency)
sample-data/                 Dummy P&L workbook and its generator
```

### Adding a page

1. Create `src/pages/MyPage.tsx`.
2. Add one entry to the `pages` array in `src/pages/registry.tsx`.

The nav bar and router pick it up automatically. Routing uses the URL hash (`#/backtest`), so it works on any static host without server rules.

## Notes on the analysis

- **Analysis** expects the Groww "P&L Statement for Futures & Options" export. Overlapping statements are de-duplicated by trade. Charges are summed per file, so use non-overlapping periods for accurate cost figures.
- **Backtesting** also contains Turtle and UT Bot signal engines (`src/lib/backtest/`). Their templates are commented out in `presets.ts` to keep the template list light; uncomment a preset and its import to bring one back.
- **Backtesting** signals on a bar's close and fills at the next open, which avoids look-ahead bias. Results depend on the candle data source and interval.
- **Move Study** only reports a condition as holding if it has enough cases and points the same direction in both the first 70% and last 30% of the period. Treat it as a way to generate hypotheses, not as a trading signal.

## Troubleshooting

- **`npm run dev` is blocked on Windows PowerShell** ("running scripts is disabled"): run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or start Vite with `node node_modules/vite/bin/vite.js`.
- **403 from Groww**: the token lacks market-data permission, is IP-restricted, or has expired.
- **401 from Groww**: the token is missing or expired. Update `.env` and restart the dev server, because Vite reads `.env` only at startup.
- **Data pages empty after deploying**: see "How data fetching works".

## Disclaimer

For education and personal analysis only. Nothing here is investment advice. Backtests and statistics describe the past and do not predict future results.

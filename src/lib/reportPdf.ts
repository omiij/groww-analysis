/**
 * Dependency-free PDF report generation.
 *
 * Builds a self-contained, print-styled HTML document and opens it in a new
 * window, then triggers the browser's print dialog. Users choose "Save as PDF".
 * This avoids heavy client-side PDF libraries (jspdf/html2canvas) and produces
 * crisp, selectable, multi-page output.
 */
import { parseBrokerDate, type BrokerReport, type BrokerTrade } from './brokerReport';
import { formatINR, formatSignedINR } from './format';

export interface ReportStats {
  n: number;
  wins: number;
  losses: number;
  netPnL: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  costDragPct: number;
  sizeRatio: number;
  bestTrade: number;
  worstTrade: number;
}

export interface BreakdownRow {
  name: string;
  pnl: number;
  trades?: number;
  winRate?: number;
}

export interface RiskStats {
  maxDrawdown: number;
  maxDrawdownPct: number;
  currentDrawdown: number;
  longestWin: number;
  longestLoss: number;
  recoveryFactor: number;
}

export interface HoldingStats {
  rows: BreakdownRow[];
  avgWinnerDays: number;
  avgLoserDays: number;
}

export interface ReportData {
  report: BrokerReport;
  stats: ReportStats;
  dateRange: string;
  byIndex: BreakdownRow[];
  byDay: BreakdownRow[];
  byWeekday: BreakdownRow[];
  /** Optional Edge & Risk analytics. */
  risk?: RiskStats | null;
  holding?: HoldingStats;
  byInstrument?: BreakdownRow[];
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );

const num = (v: number): string => v.toLocaleString('en-IN');
const pct = (v: number): string => `${v.toFixed(1)}%`;
const cls = (v: number): string => (v >= 0 ? 'pos' : 'neg');

/** A labelled metric cell. */
function metric(label: string, value: string, valueClass = ''): string {
  return `
    <div class="metric">
      <div class="metric-label">${esc(label)}</div>
      <div class="metric-value ${valueClass}">${esc(value)}</div>
    </div>`;
}

/** A breakdown table (name, P&L, optional trades + win rate). */
function breakdownTable(
  title: string,
  rows: BreakdownRow[],
  opts: { showTrades?: boolean; showWinRate?: boolean } = {}
): string {
  if (!rows.length) return '';
  const head = `
    <tr>
      <th>${esc(title)}</th>
      <th class="r">P&amp;L</th>
      ${opts.showTrades ? '<th class="r">Trades</th>' : ''}
      ${opts.showWinRate ? '<th class="r">Win %</th>' : ''}
    </tr>`;
  const body = rows
    .map(
      (r) => `
    <tr>
      <td>${esc(r.name)}</td>
      <td class="r ${cls(r.pnl)}">${esc(formatSignedINR(r.pnl))}</td>
      ${opts.showTrades ? `<td class="r">${r.trades ?? 0}</td>` : ''}
      ${opts.showWinRate ? `<td class="r">${pct(r.winRate ?? 0)}</td>` : ''}
    </tr>`
    )
    .join('');
  return `<table class="tbl"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** Trade-by-trade table with buy/sell prices, sorted by sell date. */
function tradesTable(trades: BrokerTrade[]): string {
  if (!trades.length) return '';
  const sorted = [...trades].sort(
    (a, b) => parseBrokerDate(a.sellDate) - parseBrokerDate(b.sellDate)
  );
  const rows = sorted
    .map(
      (t, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(t.scrip)}</td>
      <td class="r">${num(t.quantity)}</td>
      <td>${esc(t.buyDate)}</td>
      <td class="r">${formatINR(t.buyPrice, true)}</td>
      <td>${esc(t.sellDate)}</td>
      <td class="r">${formatINR(t.sellPrice, true)}</td>
      <td class="r ${cls(t.realizedPnL)}">${esc(formatSignedINR(t.realizedPnL))}</td>
    </tr>`
    )
    .join('');
  return `<table class="tbl trades">
    <thead>
      <tr>
        <th>#</th>
        <th>Scrip</th>
        <th class="r">Qty</th>
        <th>Buy Date</th>
        <th class="r">Buy Price</th>
        <th>Sell Date</th>
        <th class="r">Sell Price</th>
        <th class="r">P&amp;L</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** The optional "Edge & Risk" section (drawdown, streaks, holding, instrument). */
function edgeRiskSection(data: ReportData): string {
  const { risk, holding, byInstrument } = data;
  if (!risk && !holding && !byInstrument) return '';

  const riskGrid = risk
    ? `<div class="grid">
        ${metric('Max Drawdown', `-${formatINR(risk.maxDrawdown, true)}`, 'neg')}
        ${metric('Max DD %', pct(risk.maxDrawdownPct), 'neg')}
        ${metric(
          'Current Drawdown',
          risk.currentDrawdown > 0 ? `-${formatINR(risk.currentDrawdown, true)}` : '\u20b90'
        )}
        ${metric(
          'Recovery Factor',
          risk.recoveryFactor === Infinity ? '\u221e' : risk.recoveryFactor.toFixed(2),
          risk.recoveryFactor >= 1 ? 'pos' : 'neg'
        )}
        ${metric('Longest Win Streak', String(risk.longestWin), 'pos')}
        ${metric('Longest Loss Streak', String(risk.longestLoss), 'neg')}
      </div>`
    : '';

  const holdingTbl = holding?.rows?.length
    ? `<p class="sub">Avg winner held ${holding.avgWinnerDays.toFixed(
        1
      )}d · avg loser held ${holding.avgLoserDays.toFixed(1)}d</p>
       ${breakdownTable('Holding Period', holding.rows, { showTrades: true, showWinRate: true })}`
    : '';

  const instrumentTbl = byInstrument?.length
    ? breakdownTable('Instrument Type', byInstrument, { showTrades: true, showWinRate: true })
    : '';

  const cols =
    holdingTbl || instrumentTbl
      ? `<div class="cols"><div>${holdingTbl}</div><div>${instrumentTbl}</div></div>`
      : '';

  return `<h2>Edge &amp; Risk</h2>${riskGrid}${cols}`;
}

/** Build the full HTML document string for the report. */
export function buildReportHtml(data: ReportData): string {
  const { report, stats, dateRange } = data;
  const generatedAt = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const profitFactor = stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2);
  const sizeRatio = stats.sizeRatio === Infinity ? '∞' : stats.sizeRatio.toFixed(2);

  const charges = report.charges;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Groww F&O Analysis Report</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    font-size: 12px;
    line-height: 1.45;
    padding: 28px 32px;
  }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #10b981; }
  .sub { color: #64748b; font-size: 11px; margin-bottom: 2px; }
  .brand { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .pill { background:#10b98122; color:#047857; border-radius:999px; padding:3px 10px; font-size:11px; font-weight:600; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 8px; }
  .metric { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background:#f8fafc; }
  .metric-label { font-size: 9.5px; letter-spacing: .04em; text-transform: uppercase; color:#64748b; }
  .metric-value { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .pos { color: #047857; }
  .neg { color: #dc2626; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  table.tbl { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.tbl th, table.tbl td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  table.tbl th { background:#f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing:.03em; color:#475569; }
  table.tbl td.r, table.tbl th.r { text-align: right; }
  .charges td:last-child { text-align: right; }
  .footer { margin-top: 26px; color:#94a3b8; font-size: 10px; text-align:center; border-top:1px solid #e2e8f0; padding-top:10px; }
  @media print {
    body { padding: 0; }
    h2 { break-after: avoid; }
    table, .grid, .cols { break-inside: avoid; }
    table.trades { break-inside: auto; font-size: 10px; }
    table.trades thead { display: table-header-group; }
    table.trades tr { break-inside: avoid; }
    @page { margin: 16mm 14mm; }
  }
</style>
</head>
<body>
  <div class="brand">
    <div>
      <h1>Groww F&amp;O History Analysis</h1>
      <div class="sub">Trading performance report${
        report.clientName ? ` · ${esc(report.clientName)}` : ''
      }</div>
      <div class="sub">${dateRange ? `Period: ${esc(dateRange)}` : ''}</div>
    </div>
    <div class="pill">${stats.n} trades</div>
  </div>

  <h2>Key Metrics</h2>
  <div class="grid">
    ${metric('Net P&L', formatSignedINR(stats.netPnL), cls(stats.netPnL))}
    ${metric('Win Rate', pct(stats.winRate), stats.winRate >= 50 ? 'pos' : 'neg')}
    ${metric('Expectancy / Trade', formatSignedINR(stats.expectancy), cls(stats.expectancy))}
    ${metric('Profit Factor', profitFactor, stats.profitFactor >= 1 ? 'pos' : 'neg')}
    ${metric('Avg Win', formatINR(stats.avgWin, true), 'pos')}
    ${metric('Avg Loss', formatINR(stats.avgLoss, true), 'neg')}
    ${metric('Win/Loss Size', sizeRatio, stats.sizeRatio >= 1 ? 'pos' : 'neg')}
    ${metric('Cost Drag', pct(stats.costDragPct), stats.costDragPct > 25 ? 'neg' : '')}
    ${metric('Best Trade', formatSignedINR(stats.bestTrade), 'pos')}
    ${metric('Worst Trade', formatSignedINR(stats.worstTrade), 'neg')}
    ${metric('Wins / Losses', `${stats.wins} / ${stats.losses}`)}
    ${metric('Total Trades', num(stats.n))}
  </div>

  <h2>P&amp;L Summary</h2>
  <div class="grid">
    ${metric(
      'Realised Futures',
      formatSignedINR(report.realisedFutures),
      cls(report.realisedFutures)
    )}
    ${metric(
      'Realised Options',
      formatSignedINR(report.realisedOptions),
      cls(report.realisedOptions)
    )}
    ${metric(
      'Realised Total (gross)',
      formatSignedINR(report.realisedTotal),
      cls(report.realisedTotal)
    )}
    ${metric('Net (after charges)', formatSignedINR(report.net), cls(report.net))}
  </div>

  <h2>Charges Breakdown</h2>
  <table class="tbl charges">
    <tbody>
      <tr><td>Brokerage</td><td>${formatINR(charges.brokerage, true)}</td></tr>
      <tr><td>Exchange Txn</td><td>${formatINR(charges.exchangeTxn, true)}</td></tr>
      <tr><td>STT</td><td>${formatINR(charges.stt, true)}</td></tr>
      <tr><td>SEBI</td><td>${formatINR(charges.sebi, true)}</td></tr>
      <tr><td>Stamp Duty</td><td>${formatINR(charges.stampDuty, true)}</td></tr>
      <tr><td>IPFT</td><td>${formatINR(charges.ipft, true)}</td></tr>
      <tr><td>GST</td><td>${formatINR(charges.gst, true)}</td></tr>
      <tr><td><strong>Total Charges</strong></td><td><strong>${formatINR(
        charges.total,
        true
      )}</strong></td></tr>
    </tbody>
  </table>

  ${edgeRiskSection(data)}

  <h2>Breakdowns</h2>
  <div class="cols">
    <div>
      ${breakdownTable('By Index', data.byIndex, { showTrades: true, showWinRate: true })}
    </div>
    <div>
      ${breakdownTable('By Weekday', data.byWeekday, { showTrades: true, showWinRate: true })}
    </div>
  </div>

  <h2>Day-wise P&amp;L</h2>
  ${breakdownTable('Date', data.byDay, { showTrades: true })}

  <h2>All Trades (${report.trades.length})</h2>
  ${tradesTable(report.trades)}

  <div class="footer">
    Generated ${esc(generatedAt)} · Figures are historical and for personal review only.
  </div>
  <script>
    // Auto-open the print dialog once the report has rendered.
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 350);
    });
  </script>
</body>
</html>`;
}

/**
 * Print the report via a hidden iframe. This is the fallback used when a popup
 * window is blocked — it never shows a blank tab.
 */
function printViaIframe(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  iframe.contentWindow?.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Safety cleanup in case afterprint never fires.
    setTimeout(cleanup, 60_000);
  }, 400);
}

/**
 * Open the report in a new tab (which auto-triggers the print dialog) using a
 * Blob URL so the tab shows the fully-rendered report rather than about:blank.
 * Falls back to a hidden iframe if the popup is blocked.
 *
 * Always returns true because a print path is guaranteed (popup or iframe).
 */
export function downloadReportPdf(data: ReportData): boolean {
  const html = buildReportHtml(data);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  // NOTE: no `noopener` here — it severs the window handle and leaves a blank tab.
  const win = window.open(url, '_blank');

  if (win) {
    // Revoke the object URL after the tab has had time to load it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }

  // Popup blocked — fall back to a hidden iframe in the current page.
  URL.revokeObjectURL(url);
  printViaIframe(html);
  return true;
}

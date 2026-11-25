import * as XLSX from 'xlsx';

/**
 * Parser for Groww "P&L Statement for Futures & Options" exports (CSV or XLSX).
 *
 * The report is sectioned, not a flat table:
 *   - header rows (Name, client code)
 *   - "Summary" -> Realised P&L (Futures/Options/Total) + Charges breakdown
 *   - "Realised trades (trade level)" -> Futures table, then Options table, each
 *     with a header: Scrip Name, Quantity, Buy Date, Buy Price, Buy Value,
 *     Sell Date, Sell Price, Sell Value, Realized P&L
 *
 * We read each sheet into a 2D array of cells so the same logic handles both
 * comma-separated CSV text and real .xlsx workbooks. For historical analysis we
 * also merge many reports into one aggregated dataset.
 */

export type BrokerOptionType = 'CE' | 'PE' | 'FUT';

export interface BrokerTrade {
  scrip: string;
  symbol: string; // e.g. SENSEX, NIFTY, BANKNIFTY
  strike?: number;
  optionType: BrokerOptionType;
  expiry?: string; // "01 Oct 2026" as printed
  quantity: number;
  buyDate: string;
  buyPrice: number;
  buyValue: number;
  sellDate: string;
  sellPrice: number;
  sellValue: number;
  realizedPnL: number;
  segment: 'Options' | 'Futures';
}

export interface BrokerCharges {
  exchangeTxn: number;
  sebi: number;
  stt: number;
  stampDuty: number;
  ipft: number;
  brokerage: number;
  gst: number;
  total: number;
}

export interface BrokerReport {
  clientName?: string;
  period?: string;
  realisedFutures: number;
  realisedOptions: number;
  realisedTotal: number;
  charges: BrokerCharges;
  trades: BrokerTrade[];
  /** Net after charges, derived: realisedTotal - charges.total. */
  net: number;
}

/** Parse a messy numeric cell ("5,349", "₹39.28", "", "-105") into a number. */
const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[₹,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Parse a Groww scrip string into its parts.
 *  Options: "SENSEX 01 OCT 26 72200 Put" / "NIFTY 09 OCT 25 25000 CE"
 *  Futures: "NIFTY 30 OCT 25 FUT"
 */
export const parseScrip = (
  scrip: string
): { symbol: string; strike?: number; optionType: BrokerOptionType; expiry?: string } => {
  const s = scrip.trim();
  const tokens = s.split(/\s+/);
  const symbol = tokens[0]?.toUpperCase() ?? '';

  const upper = s.toUpperCase();
  const isPut = /\bPUT\b|\bPE\b/.test(upper);
  const isCall = /\bCALL\b|\bCE\b/.test(upper);
  const isFut = /\bFUT\b|\bFUTURES\b/.test(upper);

  let optionType: BrokerOptionType = 'FUT';
  if (isPut) optionType = 'PE';
  else if (isCall) optionType = 'CE';
  else if (isFut) optionType = 'FUT';

  // Strike: the largest standalone integer in the string (handles 72200, 25000).
  let strike: number | undefined;
  const nums = s.match(/\b\d{3,6}\b/g);
  if (nums && (optionType === 'CE' || optionType === 'PE')) {
    strike = Math.max(...nums.map((n) => Number(n)));
  }

  // Expiry: "DD MON YY" group, e.g. "01 OCT 26".
  const expMatch = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})/);
  const expiry = expMatch ? `${expMatch[1]} ${expMatch[2]} ${expMatch[3]}` : undefined;

  return { symbol, strike, optionType, expiry };
};

/** Build a 2D cell grid from a File (xlsx or csv). */
export const fileToGrid = async (file: File): Promise<string[][]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: '',
    raw: false,
  });
  return rows.map((r) => (Array.isArray(r) ? r.map((c) => str(c)) : []));
};

const TRADE_HEADER_RE = /scrip\s*name/i;

/** Does a header row look like the trade-level table header? */
const isTradeHeader = (row: string[]): boolean =>
  row.some((c) => TRADE_HEADER_RE.test(c)) && row.some((c) => /realized\s*p&?l/i.test(c));

/** Find a value on a row whose first cell matches `label`. */
const findRowValue = (grid: string[][], label: RegExp): number | undefined => {
  for (const row of grid) {
    if (row[0] && label.test(row[0])) {
      for (let i = 1; i < row.length; i++) {
        if (str(row[i]) !== '') return num(row[i]);
      }
    }
  }
  return undefined;
};

/** Parse one full report from a cell grid. */
export const parseBrokerReport = (grid: string[][]): BrokerReport => {
  const trades: BrokerTrade[] = [];

  let clientName: string | undefined;
  let period: string | undefined;
  for (const row of grid) {
    const first = str(row[0]);
    if (/^name$/i.test(first) && row[1]) clientName = str(row[1]);
    if (/p&?l statement/i.test(first)) period = first;
  }

  let realisedFutures = 0;
  let realisedOptions = 0;
  let realisedTotal = 0;

  const charges: BrokerCharges = {
    exchangeTxn: findRowValue(grid, /exchange transaction/i) ?? 0,
    sebi: findRowValue(grid, /sebi/i) ?? 0,
    stt: findRowValue(grid, /^stt$|securities transaction/i) ?? 0,
    stampDuty: findRowValue(grid, /stamp/i) ?? 0,
    ipft: findRowValue(grid, /ipft/i) ?? 0,
    brokerage: findRowValue(grid, /brokerage/i) ?? 0,
    gst: findRowValue(grid, /gst/i) ?? 0,
    total: 0,
  };
  charges.total =
    charges.exchangeTxn +
    charges.sebi +
    charges.stt +
    charges.stampDuty +
    charges.ipft +
    charges.brokerage +
    charges.gst;

  let firstTradeHeaderIdx = grid.length;
  for (let i = 0; i < grid.length; i++) {
    if (isTradeHeader(grid[i])) {
      firstTradeHeaderIdx = i;
      break;
    }
  }
  for (let i = 0; i < firstTradeHeaderIdx; i++) {
    const label = str(grid[i][0]).toLowerCase();
    const val = num(grid[i][1]);
    if (label === 'futures' && str(grid[i][1]) !== '') realisedFutures = val;
    else if (label === 'options' && str(grid[i][1]) !== '') realisedOptions = val;
    else if (label === 'total' && str(grid[i][1]) !== '') realisedTotal = val;
  }
  if (!realisedTotal) realisedTotal = realisedFutures + realisedOptions;

  let currentSegment: 'Options' | 'Futures' = 'Options';
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    const first = str(row[0]).toLowerCase();

    if (first === 'futures' && str(row[1]) === '') currentSegment = 'Futures';
    else if (first === 'options' && str(row[1]) === '') currentSegment = 'Options';

    if (isTradeHeader(row)) {
      for (let j = i + 1; j < grid.length; j++) {
        const dr = grid[j];
        const scrip = str(dr[0]);
        if (scrip === '') break;
        if (isTradeHeader(dr)) break;
        if (/^(futures|options|disclaimer|summary)/i.test(scrip)) break;

        const quantity = num(dr[1]);
        if (!quantity && num(dr[3]) === 0 && num(dr[6]) === 0) continue;

        const parsed = parseScrip(scrip);
        trades.push({
          scrip,
          symbol: parsed.symbol,
          strike: parsed.strike,
          optionType: currentSegment === 'Futures' ? 'FUT' : parsed.optionType,
          expiry: parsed.expiry,
          quantity,
          buyDate: str(dr[2]),
          buyPrice: num(dr[3]),
          buyValue: num(dr[4]),
          sellDate: str(dr[5]),
          sellPrice: num(dr[6]),
          sellValue: num(dr[7]),
          realizedPnL: num(dr[8]),
          segment: currentSegment,
        });
      }
      i = i + 1;
    }
  }

  const net = realisedTotal - charges.total;

  return {
    clientName,
    period,
    realisedFutures,
    realisedOptions,
    realisedTotal,
    charges,
    trades,
    net,
  };
};

/** Parse straight from an uploaded File. */
export const parseBrokerFile = async (file: File): Promise<BrokerReport> => {
  const grid = await fileToGrid(file);
  return parseBrokerReport(grid);
};

/** Stable identity for a trade, used to de-dupe across overlapping reports. */
const tradeKey = (t: BrokerTrade): string =>
  [t.scrip, t.quantity, t.buyDate, t.buyPrice, t.sellDate, t.sellPrice, t.realizedPnL].join('|');

/**
 * Merge several parsed reports into one aggregated dataset for historical
 * analysis. Trades are de-duplicated (reports may overlap in date range), and
 * charges + realised totals are summed. Because we can't tell which charges
 * belong to deduped trades, charges are summed from unique source files only —
 * callers pass already-parsed reports, so we sum charges as-is and let the UI
 * note that charges assume non-overlapping files.
 */
export const mergeReports = (reports: BrokerReport[]): BrokerReport => {
  const seen = new Set<string>();
  const trades: BrokerTrade[] = [];
  for (const r of reports) {
    for (const t of r.trades) {
      const k = tradeKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      trades.push(t);
    }
  }

  const charges: BrokerCharges = reports.reduce(
    (acc, r) => ({
      exchangeTxn: acc.exchangeTxn + r.charges.exchangeTxn,
      sebi: acc.sebi + r.charges.sebi,
      stt: acc.stt + r.charges.stt,
      stampDuty: acc.stampDuty + r.charges.stampDuty,
      ipft: acc.ipft + r.charges.ipft,
      brokerage: acc.brokerage + r.charges.brokerage,
      gst: acc.gst + r.charges.gst,
      total: acc.total + r.charges.total,
    }),
    { exchangeTxn: 0, sebi: 0, stt: 0, stampDuty: 0, ipft: 0, brokerage: 0, gst: 0, total: 0 }
  );

  const realisedOptions = trades
    .filter((t) => t.segment === 'Options')
    .reduce((s, t) => s + t.realizedPnL, 0);
  const realisedFutures = trades
    .filter((t) => t.segment === 'Futures')
    .reduce((s, t) => s + t.realizedPnL, 0);
  const realisedTotal = realisedOptions + realisedFutures;

  return {
    clientName: reports.find((r) => r.clientName)?.clientName,
    period: `${reports.length} report${reports.length === 1 ? '' : 's'}`,
    realisedFutures: Number(realisedFutures.toFixed(2)),
    realisedOptions: Number(realisedOptions.toFixed(2)),
    realisedTotal: Number(realisedTotal.toFixed(2)),
    charges,
    trades,
    net: Number((realisedTotal - charges.total).toFixed(2)),
  };
};

/** Parse a Groww date like "01 Oct 2026" to a timestamp (NaN-safe -> 0). */
export const parseBrokerDate = (s: string): number => {
  const t = new Date((s || '').trim()).getTime();
  return Number.isNaN(t) ? 0 : t;
};

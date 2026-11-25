/**
 * Generates sample-data/dummy-groww-pnl.xlsx in the layout of a Groww
 * "P&L Statement for Futures & Options" export. All numbers are made up.
 *
 * Run from the project root:  node sample-data/make-dummy-xlsx.cjs
 */
const path = require('path');
const XLSX = require('xlsx');

// [scrip, qty, buyDate, buyPrice, sellDate, sellPrice]
const options = [
  // Mon 5 Oct
  ['NIFTY 06 OCT 26 24500 CE', 75, '05 Oct 2026', 182.5, '05 Oct 2026', 214.0],
  ['NIFTY 06 OCT 26 24400 PE', 75, '05 Oct 2026', 165.0, '05 Oct 2026', 141.25],
  ['BANKNIFTY 28 OCT 26 52000 CE', 35, '05 Oct 2026', 232.0, '05 Oct 2026', 251.5],
  ['NIFTY 06 OCT 26 24550 CE', 75, '05 Oct 2026', 148.0, '05 Oct 2026', 131.5],
  // Tue 6 Oct
  ['NIFTY 13 OCT 26 24600 CE', 75, '06 Oct 2026', 205.0, '06 Oct 2026', 248.75],
  ['NIFTY 13 OCT 26 24500 PE', 75, '06 Oct 2026', 176.0, '06 Oct 2026', 158.0],
  ['BANKNIFTY 28 OCT 26 51800 PE', 35, '06 Oct 2026', 219.0, '06 Oct 2026', 268.0],
  ['NIFTY 13 OCT 26 24650 CE', 75, '06 Oct 2026', 158.5, '06 Oct 2026', 187.0],
  // Wed 7 Oct (the day the rules say to skip)
  ['NIFTY 13 OCT 26 24700 CE', 75, '07 Oct 2026', 240.0, '07 Oct 2026', 196.5],
  ['BANKNIFTY 28 OCT 26 52200 CE', 35, '07 Oct 2026', 255.0, '07 Oct 2026', 214.0],
  ['NIFTY 13 OCT 26 24550 PE', 75, '07 Oct 2026', 150.0, '07 Oct 2026', 122.5],
  // Thu 8 Oct
  ['NIFTY 13 OCT 26 24600 PE', 75, '08 Oct 2026', 190.0, '08 Oct 2026', 207.5],
  ['BANKNIFTY 28 OCT 26 52000 PE', 35, '08 Oct 2026', 228.0, '08 Oct 2026', 205.0],
  ['NIFTY 13 OCT 26 24700 CE', 75, '08 Oct 2026', 171.0, '09 Oct 2026', 196.0],
  // Fri 9 Oct
  ['NIFTY 13 OCT 26 24650 PE', 75, '09 Oct 2026', 143.0, '09 Oct 2026', 169.5],
  ['BANKNIFTY 28 OCT 26 52400 CE', 35, '09 Oct 2026', 246.0, '09 Oct 2026', 219.5],
  // Mon 12 Oct
  ['NIFTY 13 OCT 26 24800 CE', 75, '12 Oct 2026', 212.0, '12 Oct 2026', 259.0],
  ['NIFTY 13 OCT 26 24700 PE', 75, '12 Oct 2026', 184.0, '12 Oct 2026', 163.0],
  ['BANKNIFTY 28 OCT 26 52500 CE', 35, '12 Oct 2026', 238.0, '12 Oct 2026', 276.0],
  // Tue 13 Oct
  ['NIFTY 13 OCT 26 24850 CE', 75, '13 Oct 2026', 196.0, '13 Oct 2026', 224.5],
  ['NIFTY 13 OCT 26 24750 PE', 75, '13 Oct 2026', 167.5, '13 Oct 2026', 149.0],
  ['BANKNIFTY 28 OCT 26 52600 PE', 35, '13 Oct 2026', 201.0, '13 Oct 2026', 233.0],
];

const futures = [
  ['NIFTY 27 OCT 26 FUT', 75, '06 Oct 2026', 24512.0, '08 Oct 2026', 24590.5],
  ['BANKNIFTY 27 OCT 26 FUT', 35, '09 Oct 2026', 52310.0, '12 Oct 2026', 52180.0],
];

const round2 = (n) => Math.round(n * 100) / 100;

const toRows = (list) =>
  list.map(([scrip, qty, buyDate, buyPrice, sellDate, sellPrice]) => {
    const buyValue = round2(buyPrice * qty);
    const sellValue = round2(sellPrice * qty);
    return [scrip, qty, buyDate, buyPrice, buyValue, sellDate, sellPrice, sellValue, round2(sellValue - buyValue)];
  });

const optRows = toRows(options);
const futRows = toRows(futures);
const sum = (rows) => round2(rows.reduce((s, r) => s + r[8], 0));
const realisedOptions = sum(optRows);
const realisedFutures = sum(futRows);

const charges = {
  'Exchange Transaction Charges': 412.35,
  'SEBI Turnover Fees': 4.12,
  STT: 1186.0,
  'Stamp Duty': 86.5,
  IPFT: 0.41,
  Brokerage: 880.0,
  GST: 232.9,
};

const tradeHeader = [
  'Scrip Name',
  'Quantity',
  'Buy Date',
  'Buy Price',
  'Buy Value',
  'Sell Date',
  'Sell Price',
  'Sell Value',
  'Realized P&L',
];

const grid = [
  ['Name', 'Demo Trader'],
  ['Client Code', 'DEMO0001'],
  ['P&L Statement for Futures & Options from 05-10-2026 to 13-10-2026'],
  [],
  ['Summary'],
  ['Realised P&L'],
  ['Futures', realisedFutures],
  ['Options', realisedOptions],
  ['Total', round2(realisedFutures + realisedOptions)],
  [],
  ['Charges'],
  ...Object.entries(charges).map(([k, v]) => [k, v]),
  [],
  ['Realised trades (trade level)'],
  [],
  ['Futures'],
  tradeHeader,
  ...futRows,
  [],
  ['Options'],
  tradeHeader,
  ...optRows,
  [],
  ['Disclaimer: sample data for testing only.'],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), 'P&L');
const out = path.join(__dirname, 'dummy-groww-pnl.xlsx');
XLSX.writeFile(wb, out);

const total = round2(realisedFutures + realisedOptions);
const chargeTotal = round2(Object.values(charges).reduce((s, v) => s + v, 0));
console.log(`wrote ${out}`);
console.log(`trades=${optRows.length + futRows.length} gross=${total} charges=${chargeTotal} net=${round2(total - chargeTotal)}`);

/** Format a number as Indian-locale currency, e.g. 12345 -> "₹12,345". */
export const formatINR = (value: number, withDecimals = false): string =>
  `₹${value.toLocaleString('en-IN', withDecimals ? { minimumFractionDigits: 2 } : undefined)}`;

/**
 * Format a signed P&L amount, e.g. 1200 -> "+₹1,200.00", -500 -> "-₹500.00".
 */
export const formatSignedINR = (value: number): string => {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
};

/** Short calendar-day label, e.g. "01 Oct". */
export const toDayLabel = (date: Date): string =>
  date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

/** "01 Oct 26" style label with 2-digit year. */
export const toDayYearLabel = (date: Date): string =>
  date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

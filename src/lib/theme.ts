/** Shared color + surface style constants (dark theme). */
export const COLORS = {
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  panel: '#111827',
  panelAlt: '#1f2937',
  surface: '#0f172a',
  textPrimary: '#f8fafc',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  textBody: '#cbd5e1',
} as const;

/** Base style for the dark "card / paper" surfaces. */
export const panelSx = {
  bgcolor: COLORS.panel,
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 2,
} as const;

/** Return a P&L color based on whether the value is non-negative. */
export const pnlColor = (value: number): string => (value >= 0 ? COLORS.success : COLORS.danger);

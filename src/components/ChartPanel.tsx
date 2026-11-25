import type React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { ResponsiveContainer } from 'recharts';
import { COLORS, panelSx } from '../lib/theme';

interface ChartPanelProps {
  title: React.ReactNode;
  action?: React.ReactNode;
  height?: number;
  empty?: boolean;
  emptyMessage?: string;
  children: React.ReactElement;
  accent?: string;
}

/** Dark panel wrapping a recharts chart with a header + shared empty state. */
const ChartPanel: React.FC<ChartPanelProps> = ({
  title,
  action,
  height = 260,
  empty = false,
  emptyMessage = 'Not enough data to plot yet.',
  children,
  accent,
}) => {
  return (
    <Paper sx={{ ...panelSx, p: 2, ...(accent ? { borderLeft: `4px solid ${accent}` } : null) }}>
      <Box
        sx={{
          mb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: COLORS.textPrimary }}>
          {title}
        </Typography>
        {action}
      </Box>
      {empty ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
            {emptyMessage}
          </Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      )}
    </Paper>
  );
};

export default ChartPanel;

import type React from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import { COLORS } from '../lib/theme';

export const METRIC_CARD_HEIGHT = 96;

interface MetricCardProps {
  caption: string;
  value: React.ReactNode;
  accent: string;
  valueColor?: string;
  icon?: React.ReactNode;
}

/** Compact metric card with a colored left border; fixed height, no-wrap value. */
const MetricCard: React.FC<MetricCardProps> = ({ caption, value, accent, valueColor, icon }) => {
  return (
    <Card
      sx={{
        borderLeft: `4px solid ${accent}`,
        bgcolor: COLORS.panel,
        height: METRIC_CARD_HEIGHT,
        display: 'flex',
      }}>
      <CardContent
        sx={{
          py: 1.5,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          overflow: 'hidden',
          '&:last-child': { pb: 1.5 },
        }}>
        <Typography
          variant="caption"
          noWrap
          sx={{ color: 'text.secondary', fontWeight: 'bold', display: 'block' }}>
          {caption}
        </Typography>
        <Typography
          variant="h5"
          noWrap
          sx={{
            mt: 0.5,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
            fontSize: { xs: '1.15rem', sm: '1.35rem' },
            ...(valueColor ? { color: valueColor } : null),
          }}>
          {icon}
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default MetricCard;

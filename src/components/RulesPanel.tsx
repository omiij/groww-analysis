import type React from 'react';
import type { ComponentType } from 'react';
import { Box, Chip, Paper, Typography } from '@mui/material';
import type { SvgIconProps } from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import ShieldIcon from '@mui/icons-material/Shield';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import BlockIcon from '@mui/icons-material/Block';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { COLORS, panelSx } from '../lib/theme';

interface Tag {
  label: string;
  /** true = allowed / do, false = forbidden / don't. */
  ok: boolean;
}

interface Rule {
  title: string;
  headline: string;
  points?: string[];
  tags?: Tag[];
  icon: ComponentType<SvgIconProps>;
  color: string;
}

const RULES: Rule[] = [
  {
    title: 'Indices',
    headline: 'Only NIFTY and BANKNIFTY',
    points: ['Zero SENSEX. No exceptions.'],
    tags: [
      { label: 'NIFTY', ok: true },
      { label: 'BANKNIFTY', ok: true },
      { label: 'SENSEX', ok: false },
    ],
    icon: TrendingUpIcon,
    color: COLORS.info,
  },
  {
    title: 'Days',
    headline: 'Focus on Monday & Tuesday',
    points: ['Skip Wednesday.'],
    tags: [
      { label: 'Monday', ok: true },
      { label: 'Tuesday', ok: true },
      { label: 'Wednesday', ok: false },
    ],
    icon: CalendarMonthIcon,
    color: COLORS.success,
  },
  {
    title: 'Premiums',
    headline: 'Buy only between ₹140 and ₹260',
    points: ['Below ₹120: cheap decay traps.', 'Above ₹300: snapback traps.'],
    tags: [
      { label: '₹140 – ₹260', ok: true },
      { label: '< ₹120', ok: false },
      { label: '> ₹300', ok: false },
    ],
    icon: CurrencyRupeeIcon,
    color: COLORS.warning,
  },
  {
    title: 'Sizing',
    headline: 'Start with 1 lot',
    points: ['Build a +₹500 to +₹1,000 confidence buffer first.', 'Never average down.'],
    icon: ShieldIcon,
    color: COLORS.info,
  },
  {
    title: 'Stops',
    headline: 'Know when to stop',
    points: [
      'Max 10–12 trades per day.',
      '3 consecutive losses = stop for the day.',
      'After a big green day: half size, or rest.',
    ],
    icon: StopCircleIcon,
    color: COLORS.danger,
  },
  {
    title: 'Never Average',
    headline: 'NEVER AVERAGE',
    points: ['A losing trade is closed, not fed.'],
    icon: BlockIcon,
    color: COLORS.danger,
  },
];

const MOTIVATION: { icon: ComponentType<SvgIconProps>; text: string }[] = [
  { icon: PsychologyIcon, text: 'Discipline is the edge' },
  { icon: SelfImprovementIcon, text: 'Calm mind, clean trades' },
  { icon: LocalFireDepartmentIcon, text: 'Process over profit' },
  { icon: EmojiEventsIcon, text: 'Protect capital first' },
];

const RulesPanel: React.FC = () => {
  return (
    <Box sx={{ mb: 5 }}>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: { xs: 34, md: 52 },
          lineHeight: 1.1,
          mb: 1,
          color: COLORS.textPrimary,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}>
        <GavelIcon color="primary" sx={{ fontSize: { xs: 40, md: 60 } }} /> My Trading Rules
      </Typography>

      {/* Motivation banner */}
      <Paper
        sx={{
          ...panelSx,
          p: { xs: 2.5, md: 4 },
          mb: 4,
          textAlign: 'center',
          border: `2px solid ${COLORS.success}66`,
          background: `linear-gradient(135deg, ${COLORS.panel} 0%, ${COLORS.success}22 100%)`,
        }}>
        <RocketLaunchIcon sx={{ fontSize: { xs: 56, md: 80 }, color: COLORS.success }} />
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: { xs: 26, md: 40 },
            color: COLORS.textPrimary,
            mt: 1,
          }}>
          Follow the rules. The profits follow you.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5, mt: 3 }}>
          {MOTIVATION.map(({ icon: Icon, text }) => (
            <Chip
              key={text}
              icon={<Icon style={{ color: COLORS.success }} />}
              label={text}
              sx={{
                fontSize: { xs: 15, md: 18 },
                fontWeight: 700,
                py: 2.5,
                px: 1,
                bgcolor: `${COLORS.success}1f`,
                color: COLORS.textPrimary,
              }}
            />
          ))}
        </Box>
      </Paper>

      {/* Rules */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {RULES.map((rule, i) => {
          const Icon = rule.icon;
          return (
            <Paper
              key={rule.title}
              sx={{
                ...panelSx,
                p: { xs: 2.5, md: 4 },
                borderLeft: `8px solid ${rule.color}`,
                display: 'flex',
                gap: { xs: 2, md: 4 },
                alignItems: 'flex-start',
                flexDirection: { xs: 'column', sm: 'row' },
              }}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: { sm: 110 },
                }}>
                <Icon sx={{ fontSize: { xs: 64, md: 88 }, color: rule.color }} />
                <Typography
                  sx={{ fontWeight: 800, fontSize: 28, color: rule.color, lineHeight: 1 }}>
                  #{i + 1}
                </Typography>
              </Box>

              <Box sx={{ flex: 1 }}>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: { xs: 16, md: 20 },
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: COLORS.textMuted,
                  }}>
                  {rule.title}
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: { xs: 28, md: 44 },
                    lineHeight: 1.15,
                    color: COLORS.textPrimary,
                    mb: 1.5,
                  }}>
                  {rule.headline}
                </Typography>

                {rule.points?.map((p) => (
                  <Typography
                    key={p}
                    sx={{
                      fontSize: { xs: 18, md: 26 },
                      color: COLORS.textBody,
                      lineHeight: 1.4,
                    }}>
                    • {p}
                  </Typography>
                ))}

                {rule.tags && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 2 }}>
                    {rule.tags.map((t) => (
                      <Chip
                        key={t.label}
                        label={`${t.ok ? '✅' : '❌'} ${t.label}`}
                        sx={{
                          fontSize: { xs: 16, md: 22 },
                          fontWeight: 700,
                          py: 2.5,
                          px: 1,
                          bgcolor: t.ok ? `${COLORS.success}22` : `${COLORS.danger}22`,
                          color: t.ok ? COLORS.success : COLORS.danger,
                        }}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            </Paper>
          );
        })}
      </Box>

      {/* Footer reminder */}
      <Paper
        sx={{
          ...panelSx,
          mt: 4,
          p: { xs: 2.5, md: 4 },
          textAlign: 'center',
          border: `2px solid ${COLORS.warning}66`,
        }}>
        <EmojiEventsIcon sx={{ fontSize: { xs: 56, md: 72 }, color: COLORS.warning }} />
        <Typography
          sx={{ fontWeight: 800, fontSize: { xs: 24, md: 36 }, color: COLORS.textPrimary }}>
          One disciplined day at a time. 🔥
        </Typography>
      </Paper>
    </Box>
  );
};

export default RulesPanel;

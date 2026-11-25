import type React from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { COLORS } from '../lib/theme';
import type { Comparator, IndicatorName, Operand, PriceField, Rule } from '../lib/backtest/engine';
import { newRuleId } from '../lib/backtest/presets';

const PRICE_FIELDS: PriceField[] = ['close', 'open', 'high', 'low', 'volume'];
const INDICATORS: { value: IndicatorName; label: string }[] = [
  { value: 'SMA', label: 'SMA' },
  { value: 'EMA', label: 'EMA' },
  { value: 'RSI', label: 'RSI' },
  { value: 'ATR', label: 'ATR' },
  { value: 'HIGHEST', label: 'Highest High' },
  { value: 'LOWEST', label: 'Lowest Low' },
  { value: 'BB_UPPER', label: 'Bollinger Upper (2σ)' },
  { value: 'BB_MID', label: 'Bollinger Middle' },
  { value: 'BB_LOWER', label: 'Bollinger Lower (2σ)' },
  { value: 'MACD', label: 'MACD (12,26)' },
  { value: 'MACD_SIGNAL', label: 'MACD Signal (9)' },
  { value: 'MACD_HIST', label: 'MACD Histogram' },
];
const COMPARATORS: { value: Comparator; label: string }[] = [
  { value: 'crosses_above', label: 'crosses above' },
  { value: 'crosses_below', label: 'crosses below' },
  { value: '>', label: 'is above' },
  { value: '<', label: 'is below' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
];

const fixedPeriod = (name: IndicatorName) => name.startsWith('MACD');

const OperandEditor: React.FC<{ value: Operand; onChange: (o: Operand) => void }> = ({
  value,
  onChange,
}) => {
  const switchKind = (kind: Operand['kind']) => {
    if (kind === 'price') onChange({ kind: 'price', field: 'close' });
    else if (kind === 'value') onChange({ kind: 'value', value: 0 });
    else onChange({ kind: 'indicator', name: 'SMA', period: 20 });
  };
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      <TextField
        select
        size="small"
        value={value.kind}
        onChange={(e) => switchKind(e.target.value as Operand['kind'])}
        sx={{ minWidth: 100 }}>
        <MenuItem value="price">Price</MenuItem>
        <MenuItem value="indicator">Indicator</MenuItem>
        <MenuItem value="value">Number</MenuItem>
      </TextField>
      {value.kind === 'price' && (
        <TextField
          select
          size="small"
          value={value.field}
          onChange={(e) => onChange({ kind: 'price', field: e.target.value as PriceField })}
          sx={{ minWidth: 100 }}>
          {PRICE_FIELDS.map((f) => (
            <MenuItem key={f} value={f}>
              {f}
            </MenuItem>
          ))}
        </TextField>
      )}
      {value.kind === 'indicator' && (
        <>
          <TextField
            select
            size="small"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value as IndicatorName })}
            sx={{ minWidth: 170 }}>
            {INDICATORS.map((i) => (
              <MenuItem key={i.value} value={i.value}>
                {i.label}
              </MenuItem>
            ))}
          </TextField>
          {!fixedPeriod(value.name) && (
            <TextField
              size="small"
              type="number"
              label="Period"
              value={value.period}
              onChange={(e) =>
                onChange({ ...value, period: Math.max(1, Math.floor(Number(e.target.value)) || 1) })
              }
              sx={{ width: 90 }}
              slotProps={{ htmlInput: { min: 1 } }}
            />
          )}
        </>
      )}
      {value.kind === 'value' && (
        <TextField
          size="small"
          type="number"
          value={value.value}
          onChange={(e) => onChange({ kind: 'value', value: Number(e.target.value) })}
          sx={{ width: 110 }}
        />
      )}
    </Box>
  );
};

interface RuleEditorProps {
  title: string;
  hint: string;
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
}

/** Editable list of "<operand> <comparator> <operand>" rules. */
const RuleEditor: React.FC<RuleEditorProps> = ({ title, hint, rules, onChange }) => {
  const update = (id: string, patch: Partial<Rule>) =>
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block', mb: 1 }}>
        {hint}
      </Typography>
      {rules.map((r) => (
        <Box
          key={r.id}
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
            mb: 1,
            p: 1,
            bgcolor: COLORS.surface,
            borderRadius: 1,
          }}>
          <OperandEditor value={r.left} onChange={(left) => update(r.id, { left })} />
          <TextField
            select
            size="small"
            value={r.op}
            onChange={(e) => update(r.id, { op: e.target.value as Comparator })}
            sx={{ minWidth: 140 }}>
            {COMPARATORS.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <OperandEditor value={r.right} onChange={(right) => update(r.id, { right })} />
          <IconButton
            aria-label="Remove rule"
            size="small"
            onClick={() => onChange(rules.filter((x) => x.id !== r.id))}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() =>
          onChange([
            ...rules,
            {
              id: newRuleId(),
              left: { kind: 'price', field: 'close' },
              op: '>',
              right: { kind: 'indicator', name: 'SMA', period: 20 },
            },
          ])
        }>
        Add rule
      </Button>
    </Box>
  );
};

export default RuleEditor;

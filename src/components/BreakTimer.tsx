import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { keyframes } from '@emotion/react';
import { Box, Button, Paper, Typography } from '@mui/material';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SpaIcon from '@mui/icons-material/Spa';
import { COLORS, panelSx } from '../lib/theme';

/** Length of the break. */
const BREAK_MINUTES = 15;
const TOTAL_MS = BREAK_MINUTES * 60 * 1000;

/** One full breath = 8s (4s in, 4s out). */
const BREATH_SECONDS = 8;

const SIZE = 300;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const breathe = keyframes`
  0%, 100% { transform: scale(0.78); opacity: 0.75; }
  50% { transform: scale(1); opacity: 1; }
`;

const halo = keyframes`
  0%, 100% { transform: scale(0.9); opacity: 0.15; }
  50% { transform: scale(1.15); opacity: 0.4; }
`;

const fadeInOut = keyframes`
  0%, 45% { opacity: 1; }
  50%, 95% { opacity: 0; }
  100% { opacity: 1; }
`;

const fadeOutIn = keyframes`
  0%, 45% { opacity: 0; }
  50%, 95% { opacity: 1; }
  100% { opacity: 0; }
`;

type Status = 'idle' | 'running' | 'paused' | 'done';

const format = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const BreakTimer: React.FC = () => {
  const [status, setStatus] = useState<Status>('idle');
  const [remaining, setRemaining] = useState(TOTAL_MS);
  const endAtRef = useRef(0);

  // Tick against an absolute end time so throttled background tabs stay accurate.
  useEffect(() => {
    if (status !== 'running') return;
    const id = window.setInterval(() => {
      const left = endAtRef.current - Date.now();
      if (left <= 0) {
        setRemaining(0);
        setStatus('done');
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [status]);

  // Show the time left in the browser tab title while a break is running.
  useEffect(() => {
    if (status !== 'running') return;
    const original = document.title;
    document.title = `🧘 ${format(remaining)} · Break`;
    return () => {
      document.title = original;
    };
  }, [status, remaining]);

  const start = useCallback(() => {
    endAtRef.current = Date.now() + remaining;
    setStatus('running');
  }, [remaining]);

  const pause = useCallback(() => {
    setRemaining(Math.max(0, endAtRef.current - Date.now()));
    setStatus('paused');
  }, []);

  const reset = useCallback(() => {
    setRemaining(TOTAL_MS);
    setStatus('idle');
  }, []);

  const running = status === 'running';
  const done = status === 'done';
  const progress = 1 - remaining / TOTAL_MS; // 0 → 1
  const reduceMotion = {
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  };

  return (
    <Paper
      sx={{
        ...panelSx,
        mb: 5,
        p: { xs: 3, md: 5 },
        textAlign: 'center',
        overflow: 'hidden',
        border: '1px solid rgba(94, 234, 212, 0.25)',
        background:
          'radial-gradient(circle at 50% 0%, rgba(45, 212, 191, 0.14) 0%, rgba(17, 24, 39, 1) 65%)',
      }}>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: { xs: 26, md: 38 },
          color: COLORS.textPrimary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          mb: 0.5,
        }}>
        <SelfImprovementIcon sx={{ fontSize: { xs: 36, md: 48 }, color: '#5eead4' }} />
        Take a {BREAK_MINUTES}-minute break
      </Typography>
      <Typography sx={{ fontSize: { xs: 16, md: 20 }, color: COLORS.textMuted, mb: 4 }}>
        Step away. Water, stretch, look far away. Come back with a clear head.
      </Typography>

      {/* Breathing orb + progress ring */}
      <Box
        sx={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          maxWidth: '100%',
          mx: 'auto',
          mb: 4,
        }}>
        {/* soft halo */}
        <Box
          sx={{
            position: 'absolute',
            inset: 18,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(94,234,212,0.55) 0%, rgba(94,234,212,0) 70%)',
            animation: running ? `${halo} ${BREATH_SECONDS}s ease-in-out infinite` : 'none',
            opacity: running ? undefined : 0.2,
            ...reduceMotion,
          }}
        />
        {/* breathing orb */}
        <Box
          sx={{
            position: 'absolute',
            inset: 34,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #99f6e4 0%, #14b8a6 55%, #0f766e 100%)',
            boxShadow: '0 0 60px rgba(45, 212, 191, 0.45)',
            transform: 'scale(0.78)',
            animation: running ? `${breathe} ${BREATH_SECONDS}s ease-in-out infinite` : 'none',
            ...reduceMotion,
          }}
        />
        {/* progress ring */}
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
          aria-hidden="true">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#5eead4"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.3s linear' }}
          />
        </svg>
        {/* centre text */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {done ? (
            <>
              <SpaIcon sx={{ fontSize: 56, color: '#042f2e' }} />
              <Typography sx={{ fontWeight: 800, fontSize: 28, color: '#042f2e' }}>
                Refreshed
              </Typography>
            </>
          ) : (
            <>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: 52, md: 64 },
                  lineHeight: 1,
                  color: '#042f2e',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                {format(remaining)}
              </Typography>
              <Box sx={{ position: 'relative', height: 28, width: 140, mt: 1 }}>
                <Typography
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    fontWeight: 700,
                    fontSize: 20,
                    color: '#042f2e',
                    opacity: running ? 1 : 0,
                    animation: running
                      ? `${fadeInOut} ${BREATH_SECONDS}s ease-in-out infinite`
                      : 'none',
                    ...reduceMotion,
                  }}>
                  Breathe in
                </Typography>
                <Typography
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    fontWeight: 700,
                    fontSize: 20,
                    color: '#042f2e',
                    opacity: 0,
                    animation: running
                      ? `${fadeOutIn} ${BREATH_SECONDS}s ease-in-out infinite`
                      : 'none',
                    ...reduceMotion,
                  }}>
                  Breathe out
                </Typography>
                {!running && (
                  <Typography
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      fontWeight: 700,
                      fontSize: 18,
                      color: '#042f2e',
                    }}>
                    {status === 'paused' ? 'Paused' : 'Ready'}
                  </Typography>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>

      {done && (
        <Typography sx={{ fontWeight: 700, fontSize: { xs: 20, md: 26 }, color: '#5eead4', mb: 3 }}>
          Break complete. Re-read the rules above, then trade with discipline.
        </Typography>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
        {running ? (
          <Button
            variant="contained"
            size="large"
            startIcon={<PauseIcon />}
            onClick={pause}
            sx={{ fontSize: 18, px: 4, py: 1.2 }}>
            Pause
          </Button>
        ) : (
          !done && (
            <Button
              variant="contained"
              size="large"
              startIcon={<PlayArrowIcon />}
              onClick={start}
              sx={{ fontSize: 18, px: 4, py: 1.2 }}>
              {status === 'paused' ? 'Resume' : 'Start break'}
            </Button>
          )
        )}
        <Button
          variant="outlined"
          size="large"
          color="inherit"
          startIcon={<RestartAltIcon />}
          onClick={reset}
          disabled={status === 'idle'}
          sx={{ fontSize: 18, px: 4, py: 1.2 }}>
          {done ? 'Start again' : 'Reset'}
        </Button>
      </Box>
    </Paper>
  );
};

export default BreakTimer;

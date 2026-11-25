import type React from 'react';
import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { COLORS } from '../lib/theme';
import { pages } from '../pages/registry';
import { navigate } from '../lib/router';

interface NavBarProps {
  /** The currently active route path, used to highlight the active link. */
  currentPath: string;
}

const NavBar: React.FC<NavBarProps> = ({ currentPath }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const go = (path: string) => {
    navigate(path);
    setAnchorEl(null);
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: COLORS.panel,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
      <Toolbar sx={{ maxWidth: 1280, mx: 'auto', width: '100%', px: { xs: 2, sm: 3 } }}>
        {/* Brand */}
        <Box
          onClick={() => go('/')}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            mr: 4,
            userSelect: 'none',
          }}>
          <ShowChartIcon sx={{ color: COLORS.success }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>
            Groww Analysis
          </Typography>
        </Box>

        {/* Desktop links */}
        {!isMobile && (
          <Box sx={{ display: 'flex', gap: 1, flexGrow: 1 }}>
            {pages.map((p) => {
              const active = p.path === currentPath;
              const Icon = p.icon;
              return (
                <Button
                  key={p.path}
                  onClick={() => go(p.path)}
                  startIcon={Icon ? <Icon fontSize="small" /> : undefined}
                  sx={{
                    color: active ? COLORS.success : COLORS.textBody,
                    fontWeight: active ? 700 : 500,
                    textTransform: 'none',
                    borderBottom: active
                      ? `2px solid ${COLORS.success}`
                      : '2px solid transparent',
                    borderRadius: 0,
                    px: 1.5,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.04)', color: COLORS.textPrimary },
                  }}>
                  {p.label}
                </Button>
              );
            })}
          </Box>
        )}

        {/* Mobile hamburger */}
        {isMobile && (
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <IconButton
              edge="end"
              aria-label="menu"
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{ color: COLORS.textPrimary }}>
              <MenuIcon />
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
              {pages.map((p) => {
                const active = p.path === currentPath;
                const Icon = p.icon;
                return (
                  <MenuItem key={p.path} selected={active} onClick={() => go(p.path)}>
                    {Icon && (
                      <ListItemIcon>
                        <Icon
                          fontSize="small"
                          sx={{ color: active ? COLORS.success : COLORS.textMuted }}
                        />
                      </ListItemIcon>
                    )}
                    <ListItemText
                      primary={p.label}
                      slotProps={{
                        primary: {
                          sx: {
                            color: active ? COLORS.success : COLORS.textBody,
                            fontWeight: active ? 700 : 500,
                          },
                        },
                      }}
                    />
                  </MenuItem>
                );
              })}
            </Menu>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default NavBar;

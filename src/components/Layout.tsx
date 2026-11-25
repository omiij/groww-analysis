import type React from 'react';
import { Suspense } from 'react';
import { Box } from '@mui/material';
import NavBar from './NavBar';
import { useHashRoute } from '../lib/router';
import { resolvePage } from '../pages/registry';
import { COLORS } from '../lib/theme';

/**
 * App shell: renders the navigation bar and the active page based on the
 * current hash route. Pages come from the central registry (src/pages/registry.tsx).
 */
const Layout: React.FC = () => {
  const path = useHashRoute();
  const page = resolvePage(path);
  const PageComponent = page.component;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: COLORS.surface }}>
      <NavBar currentPath={page.path} />
      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', p: { xs: 2, sm: 3 } }}>
        <Suspense fallback={null}>
          <PageComponent />
        </Suspense>
      </Box>
    </Box>
  );
};

export default Layout;

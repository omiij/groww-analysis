/**
 * Central page registry.
 *
 * ====== TO ADD A NEW PAGE ======
 *   1. Create a component under src/pages/ (e.g. MyPage.tsx).
 *   2. Import it here and add one entry to the `pages` array below.
 * The navigation bar and router update automatically — no other wiring needed.
 *
 * ====== PRIVATE PAGES ======
 * Home (rules + break timer) and Orders (live Groww order book) are personal.
 * They are only registered when VITE_PRIVATE_PAGES === 'true', which is set in
 * .env.development (git-ignored, dev server only). Public/production builds
 * don't set it, so these pages are not in the nav, not routable, and their code
 * is not shipped.
 */
import { lazy } from 'react';
import type { ComponentType } from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ScienceIcon from '@mui/icons-material/Science';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import HomeIcon from '@mui/icons-material/Home';
import InsightsIcon from '@mui/icons-material/Insights';
import type { SvgIconProps } from '@mui/material';

import Analysis from './Analysis';
import About from './About';
import HistoricalData from './HistoricalData';
import Backtesting from './Backtesting';
import MoveStudy from './MoveStudy';

export interface PageDef {
  /** Route path, must start with "/". The first entry is treated as the home/default. */
  path: string;
  /** Label shown in the navigation bar. */
  label: string;
  /** Page component to render for this route. */
  component: ComponentType;
  /** Optional icon shown next to the label in the nav bar. */
  icon?: ComponentType<SvgIconProps>;
}

/** True only in your local dev environment (see .env.development). */
const PRIVATE = import.meta.env.VITE_PRIVATE_PAGES === 'true';

export const pages: PageDef[] = [
  ...(PRIVATE
    ? [
        {
          path: '/',
          label: 'Home',
          component: lazy(() => import('./Home')),
          icon: HomeIcon,
        },
      ]
    : []),
  // With Home hidden, Analysis becomes the landing page.
  {
    path: PRIVATE ? '/analysis' : '/',
    label: 'Analysis',
    component: Analysis,
    icon: InsightsIcon,
  },
  ...(PRIVATE
    ? [
        {
          path: '/orders',
          label: 'Orders',
          component: lazy(() => import('./Orders')),
          icon: ReceiptLongIcon,
        },
      ]
    : []),
  {
    path: '/historical',
    label: 'Historical Data',
    component: HistoricalData,
    icon: CandlestickChartIcon,
  },
  { path: '/backtest', label: 'Backtesting', component: Backtesting, icon: ScienceIcon },
  { path: '/move-study', label: 'Move Study', component: MoveStudy, icon: TroubleshootIcon },
  { path: '/about', label: 'About', component: About, icon: InfoOutlinedIcon },
];

/** The default/home page (first registered). */
export const HOME_PATH = pages[0]?.path ?? '/';

/** Resolve a path to its page definition, falling back to the home page. */
export function resolvePage(path: string): PageDef {
  return pages.find((p) => p.path === path) ?? pages[0];
}

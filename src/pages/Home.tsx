import type React from 'react';
import { Box } from '@mui/material';
import RulesPanel from '../components/RulesPanel';
import BreakTimer from '../components/BreakTimer';

/** Home: trading rules first, then the break timer. */
const Home: React.FC = () => {
  return (
    <Box>
      <RulesPanel />
      <BreakTimer />
    </Box>
  );
};

export default Home;

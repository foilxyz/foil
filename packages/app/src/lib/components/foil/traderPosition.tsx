'use client';

import { Box } from '@chakra-ui/react';

import { AddEditPositionProvider } from '~/lib/context/AddEditPositionContext';

import AddEditTrade from './addEditTrade';
import PositionSelector from './positionSelector';

const TradePosition = () => {
  return (
    <AddEditPositionProvider>
      <Box>
        <PositionSelector isLP={false} />
        <AddEditTrade />
      </Box>
    </AddEditPositionProvider>
  );
};

export default TradePosition;

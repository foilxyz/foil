'use client';

import {
  Flex,
  Box,
  Heading,
  Spinner,
  UnorderedList,
  ListItem,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import NumberDisplay from '~/lib/components/foil/numberDisplay';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketContext, MarketProvider } from '~/lib/context/MarketProvider';
import { tickToPrice } from '~/lib/util/util';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const usePosition = (contractId: string, positionId: string) => {
  return useQuery({
    queryKey: ['position', contractId, positionId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/positions/${positionId}?contractId=${contractId}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    refetchInterval: POLLING_INTERVAL,
  });
};

const useTransactions = (contractId: string, positionId: string) => {
  return useQuery({
    queryKey: ['transactions', contractId, positionId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/transactions?contractId=${contractId}&positionId=${positionId}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    refetchInterval: POLLING_INTERVAL,
  });
};

const PositionPage = ({
  params,
}: {
  params: { id: string; position: string };
}) => {
  const { id, position } = params;
  const [chainId, marketAddress] = id.split('%3A'); // Decoded contractId
  const positionId = position;

  const contractId = `${chainId}:${marketAddress}`;

  const { pool } = useContext(MarketContext);

  const {
    data: positionData,
    error: positionError,
    isLoading: isLoadingPosition,
  } = usePosition(contractId, positionId);

  const calculatePnL = (positionData: any) => {
    if (positionData.isLP) {
      const vEthToken = parseFloat(positionData.quoteToken);
      const vGasToken = parseFloat(positionData.baseToken);
      const marketPrice = parseFloat(
        pool?.token0Price?.toSignificant(18) || '0'
      );
      return (
        vEthToken +
        vGasToken * marketPrice -
        parseFloat(positionData.collateral)
      );
    }
    const vEthToken = parseFloat(positionData.quoteToken);
    const borrowedVEth = parseFloat(positionData.borrowedQuoteToken);
    const vGasToken = parseFloat(positionData.baseToken);
    const borrowedVGas = parseFloat(positionData.borrowedBaseToken);
    const marketPrice = parseFloat(pool?.token0Price?.toSignificant(18) || '0');
    return vEthToken - borrowedVEth + (vGasToken - borrowedVGas) * marketPrice;
  };

  const renderPositionData = () => {
    if (isLoadingPosition) {
      return (
        <Box w="100%" textAlign="center" p={4}>
          <Spinner />
        </Box>
      );
    }
    if (positionError) {
      return (
        <Box w="100%" textAlign="center" p={4}>
          Error: {(positionError as Error).message}
        </Box>
      );
    }
    if (positionData) {
      const pnl = calculatePnL(positionData);
      return (
        <Box p={8}>
          <Heading mb={4}>Position #{positionId}</Heading>
          <UnorderedList spacing={2}>
            <ListItem>Epoch: {positionData.epoch.id}</ListItem>
            <ListItem>
              {positionData.isLP ? 'Liquidity Provider' : 'Trader'}
            </ListItem>
            <ListItem>
              Collateral: <NumberDisplay value={positionData.collateral} />{' '}
              wstETH
            </ListItem>
            <ListItem>
              Base Token: <NumberDisplay value={positionData.baseToken} /> Ggas
            </ListItem>
            <ListItem>
              Quote Token: <NumberDisplay value={positionData.quoteToken} />{' '}
              wstETH
            </ListItem>
            <ListItem>
              Borrowed Base Token:{' '}
              <NumberDisplay value={positionData.borrowedBaseToken} /> Ggas
            </ListItem>
            <ListItem>
              Borrowed Quote Token:{' '}
              <NumberDisplay value={positionData.borrowedQuoteToken} /> wstETH
            </ListItem>
            {positionData.isLP ? (
              <>
                <ListItem>
                  Low Price:{' '}
                  <NumberDisplay
                    value={tickToPrice(positionData.lowPriceTick)}
                  />{' '}
                  Ggas/wstETH
                </ListItem>
                <ListItem>
                  High Price:{' '}
                  <NumberDisplay
                    value={tickToPrice(positionData.highPriceTick)}
                  />{' '}
                  Ggas/wstETH
                </ListItem>
              </>
            ) : (
              <ListItem>
                Size:{' '}
                <NumberDisplay
                  value={
                    positionData.baseToken - positionData.borrowedBaseToken
                  }
                />{' '}
                Ggas
              </ListItem>
            )}
            {/* <ListItem>
              Profit/Loss: <NumberDisplay value={pnl} /> wstETH{' '}
              <Tooltip label="This is an estimate that does not take into account slippage or fees.">
                <QuestionOutlineIcon transform="translateY(-2px)" />
              </Tooltip>
            </ListItem> */}
            {positionData.isSettled ? <ListItem>Settled</ListItem> : null}
          </UnorderedList>
        </Box>
      );
    }
    return null;
  };

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(positionData?.epoch?.id)}
    >
      <Flex w="100%" p={6}>
        <Box
          m="auto"
          border="1px solid"
          borderColor="gray.300"
          borderRadius="md"
          maxWidth="container.md"
          width="100%"
        >
          {renderPositionData()}
        </Box>
      </Flex>
    </MarketProvider>
  );
};

export default PositionPage;

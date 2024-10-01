import { QuestionOutlineIcon } from '@chakra-ui/icons';
import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Link,
  Box,
  Spinner,
  Tooltip,
} from '@chakra-ui/react';
import { useContext } from 'react';

import { MarketContext } from '../../context/MarketProvider';

import NumberDisplay from './numberDisplay';

interface Props {
  isLoading: boolean;
  error: Error | null;
  positions: any[];
  contractId: string;
}
const LiquidityPositionsTable: React.FC<Props> = ({
  isLoading,
  error,
  positions,
  contractId,
}) => {
  const { pool } = useContext(MarketContext);

  // console.log('positions = ', positions);

  if (isLoading) {
    return (
      <Box textAlign="center" py={12}>
        <Spinner opacity={0.5} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box textAlign="center" py={12}>
        Error: {error.message}
      </Box>
    );
  }

  const calculatePnL = (position: any) => {
    const vEthToken = parseFloat(position.quoteToken);
    const vGasToken = parseFloat(position.baseToken);
    const marketPrice = parseFloat(pool?.token0Price?.toSignificant(18) || '0');

    return (
      vEthToken + vGasToken * marketPrice - parseFloat(position.collateral)
    );
  };

  return (
    <TableContainer mb={4}>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>Position</Th>
            <Th>Collateral</Th>
            <Th>Base Token</Th>
            <Th>Quote Token</Th>
            <Th>Low Price</Th>
            <Th>High Price</Th>
            <Th>
              Profit/Loss{' '}
              <Tooltip label="This is an estimate that does not take into account slippage or fees.">
                <QuestionOutlineIcon transform="translateY(-1px)" />
              </Tooltip>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {positions &&
            positions.map((row: any) => {
              const pnl = calculatePnL(row);
              return (
                <Tr key={row.id}>
                  <Td>
                    <Link
                      href={`/markets/${contractId}/positions/${row.positionId}`}
                      textDecoration="underline"
                    >
                      #{row.positionId.toString()}
                    </Link>
                  </Td>
                  <Td>
                    <NumberDisplay value={row.collateral} /> wstETH
                  </Td>
                  <Td>
                    <NumberDisplay value={row.baseToken} /> Ggas
                  </Td>
                  <Td>
                    <NumberDisplay value={row.quoteToken} /> wstETH
                  </Td>
                  <Td>
                    <NumberDisplay value={row.lowPrice} /> Ggas/wstETH
                  </Td>
                  <Td>
                    <NumberDisplay value={row.highPrice} /> Ggas/wstETH
                  </Td>
                  <Td>
                    <NumberDisplay value={pnl} /> wstETH
                  </Td>
                </Tr>
              );
            })}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default LiquidityPositionsTable;

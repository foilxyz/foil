import {
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Image,
  Link,
} from '@chakra-ui/react';
import { formatDistanceToNow } from 'date-fns';
import type React from 'react';
import { useMemo, useContext } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';

import NumberDisplay from './numberDisplay';

interface Props {
  transactions: any[];
}

const getTypeDisplay = (type: string) => {
  switch (type) {
    case 'long':
      return 'Long';
    case 'short':
      return 'Short';
    case 'addLiquidity':
      return 'Add Liquidity';
    case 'removeLiquidity':
      return 'Remove Liquidity';
    default:
      return type;
  }
};

const TransactionTable: React.FC<Props> = ({ transactions }) => {
  const { address, chain } = useContext(MarketContext);

  const sortedTransactions = useMemo(() => {
    if (!transactions) return [];
    return [...transactions].sort(
      (a, b) => b.event.timestamp - a.event.timestamp
    );
  }, [transactions]);

  return (
    <TableContainer mb={4}>
      <Table variant="simple" size="sm">
        <Thead>
          <Tr>
            <Th>Time</Th>
            <Th>Market</Th>
            <Th>Position</Th>
            <Th>Type</Th>
            <Th>Collateral</Th>
            <Th>Ggas</Th>
            <Th>wstETH</Th>
            <Th>Price</Th>
            <Th />
          </Tr>
        </Thead>
        <Tbody>
          {sortedTransactions.map((row: any) => (
            <Tr key={row.id}>
              <Td>
                {formatDistanceToNow(new Date(row.event.timestamp * 1000), {
                  addSuffix: true,
                })}
              </Td>
              <Td>
                {row.position.epoch.market.name} (Epoch{' '}
                {row.position.epoch.epochId})
              </Td>
              <Td>
                <Link
                  href={`/positions/${chain?.id}:${address}/${row.position.positionId}`}
                  textDecoration="underline"
                >
                  #{row.position.positionId}
                </Link>
              </Td>
              <Td>{getTypeDisplay(row.type)}</Td>
              <Td>
                <NumberDisplay value={row.collateralDelta} />
              </Td>
              <Td>
                <NumberDisplay value={row.baseTokenDelta} />
              </Td>
              <Td>
                <NumberDisplay value={row.quoteTokenDelta} />
              </Td>
              <Td>
                <NumberDisplay value={row.tradeRatioD18 || 0} />
              </Td>
              <Td>
                <Link
                  isExternal
                  href={`${chain?.blockExplorers?.default.url}/tx/${row.event.logData.transactionHash}`}
                >
                  <Image
                    src="/etherscan.svg"
                    alt="Etherscan"
                    width={5}
                    height={5}
                    opacity={0.85}
                  />
                </Link>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default TransactionTable;

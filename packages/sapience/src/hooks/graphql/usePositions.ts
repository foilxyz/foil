import { graphqlRequest } from '@sapience/ui/lib';
import type { Position as PositionType } from '@sapience/ui/types/graphql';
import { useQuery } from '@tanstack/react-query';

// GraphQL query to fetch positions by owner address and optional market address
export const POSITIONS_QUERY = `
  query GetPositions($owner: String, $marketAddress: String, $chainId: Int) {
    positions(owner: $owner, marketAddress: $marketAddress, chainId: $chainId) {
      id
      positionId
      owner
      baseToken
      quoteToken
      collateral
      borrowedBaseToken
      borrowedQuoteToken
      isLP
      isSettled
      highPriceTick
      lowPriceTick
      lpBaseToken
      lpQuoteToken
      market {
        id
        marketId
        startTimestamp
        endTimestamp
        settled
        settlementPriceD18
        question
        optionName
        market_group {
          id
          chainId
          address
          question
          collateralSymbol
          collateralDecimals
          market {
            id
          }
          baseTokenName
          resource {
            name
            slug
          }
        }
      }
      transactions {
        id
        type
        timestamp
        transactionHash
      }
    }
  }
`;

interface UsePositionsProps {
  address?: string; // Made optional
  marketAddress?: string;
  chainId?: number; // Added chainId for fetching all market data
}

export function usePositions({
  address,
  marketAddress,
  chainId,
}: UsePositionsProps) {
  return useQuery<PositionType[]>({
    queryKey: ['positions', address, marketAddress, chainId],
    queryFn: async () => {
      // Build variables object
      const variables: {
        owner?: string;
        marketAddress?: string;
        chainId?: number;
      } = {};

      // Add owner if address is provided
      if (address && address.trim() !== '') {
        variables.owner = address;
      }

      // Add marketAddress if provided
      if (marketAddress && marketAddress.trim() !== '') {
        variables.marketAddress = marketAddress;
      }

      // Add chainId if provided (for fetching all data for a market)
      if (chainId) {
        variables.chainId = chainId;
      }

      type PositionsQueryResult = {
        positions: PositionType[];
      };

      const data = await graphqlRequest<PositionsQueryResult>(
        POSITIONS_QUERY,
        variables
      );

      return data.positions || [];
    },
    // Enable query if we have either an address OR both marketAddress and chainId
    enabled: Boolean(address) || (Boolean(marketAddress) && Boolean(chainId)),
    staleTime: 30000, // 30 seconds
    refetchInterval: 4000, // Refetch every 4 seconds
  });
}

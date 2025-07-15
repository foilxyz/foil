import { graphqlRequest } from '@sapience/ui/lib';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { MarketGroup as MarketGroupType } from '@sapience/ui/types/graphql';

import { foilApi } from '~/lib/utils/util';

// Interface for aggregated data after processing
interface AggregatedLeaderboardEntry {
  owner: string;
  totalPnL: number; // Aggregated PnL as number
}

// Query to fetch all market groups and their markets
const GET_MARKET_GROUPS = /* GraphQL */ `
  query MarketGroups {
    marketGroups {
      address
      chainId
      markets {
        marketId
        public
      }
    }
  }
`;

// Query to fetch leaderboard for a specific market
const GET_MARKET_LEADERBOARD = /* GraphQL */ `
  query MarketLeaderboard(
    $chainId: Int!
    $address: String!
    $marketId: String!
  ) {
    getMarketLeaderboard(
      chainId: $chainId
      address: $address
      marketId: $marketId
    ) {
      owner
      totalPnL # This is a string representing BigInt
    }
  }
`;

// Interface for the raw response of GET_MARKET_LEADERBOARD
interface RawMarketLeaderboardEntry {
  owner: string;
  totalPnL: string;
}

// Type definitions for GraphQL responses
type MarketGroupsQueryResponse = {
  marketGroups: MarketGroupType[];
};

type MarketLeaderboardQueryResponse = {
  getMarketLeaderboard: RawMarketLeaderboardEntry[];
};

// Hook revised for client-side aggregation
const useAllTimeLeaderboard = () => {
  return useQuery<AggregatedLeaderboardEntry[]>({
    queryKey: ['allTimeLeaderboard'], // Query key remains simple for now
    queryFn: async () => {
      try {
        // 1. Fetch all markets
        const marketGroupsData =
          await graphqlRequest<MarketGroupsQueryResponse>(GET_MARKET_GROUPS);

        if (!marketGroupsData?.marketGroups) {
          console.error('No market group data found');
          return [];
        }

        // 2. Identify all public market group / market pairs
        const publicMarketIdentifiers: {
          address: string;
          chainId: number;
          marketId: string;
        }[] = [];
        marketGroupsData.marketGroups.forEach((marketGroup) => {
          // Type guard: skip if address or chainId is missing or not correct type
          if (!marketGroup.address || typeof marketGroup.address !== 'string')
            return;
          if (typeof marketGroup.chainId !== 'number') return;
          (marketGroup.markets || []).forEach((market) => {
            if (market.public) {
              publicMarketIdentifiers.push({
                address: marketGroup.address!,
                chainId: marketGroup.chainId,
                marketId: String(market.marketId), // Ensure marketId is string for query variable
              });
            }
          });
        });

        if (publicMarketIdentifiers.length === 0) {
          return [];
        }

        // 3. Fetch leaderboards for all public markets in parallel
        const leaderboardPromises = publicMarketIdentifiers.map((identifier) =>
          graphqlRequest<MarketLeaderboardQueryResponse>(
            GET_MARKET_LEADERBOARD,
            identifier
          )
        );

        const leaderboardResponses = await Promise.all(leaderboardPromises);

        // 4. Aggregate results
        const aggregatedPnL: { [owner: string]: number } = {};

        leaderboardResponses.forEach((response, index) => {
          const identifier = publicMarketIdentifiers[index]; // For logging context

          if (!response?.getMarketLeaderboard) {
            console.warn(
              `No leaderboard data returned for ${JSON.stringify(identifier)}`
            );
            // Continue aggregation even if one market fails
            return;
          }

          const marketLeaderboard = response.getMarketLeaderboard;

          if (marketLeaderboard) {
            marketLeaderboard.forEach((entry) => {
              const { owner, totalPnL: rawPnlString } = entry; // Rename for clarity
              let pnlValue: bigint;

              try {
                // Ensure we have a string, default to '0' if null/undefined/empty
                const pnlStringToConvert = rawPnlString || '0';
                pnlValue = BigInt(pnlStringToConvert);
              } catch (e) {
                console.error(
                  `Error converting PnL string to BigInt for owner ${owner}. Raw value: '${rawPnlString}'. Error:`,
                  e
                );
                pnlValue = BigInt(0); // Default to 0 if conversion fails
              }

              if (!aggregatedPnL[owner]) {
                aggregatedPnL[owner] = 0;
              }

              // Convert BigInt to Number for aggregation
              const pnlNumber = Number(pnlValue);
              if (Number.isNaN(pnlNumber)) {
                console.error(
                  `Converted PnL number is NaN for owner ${owner}. BigInt value was: ${pnlValue}. Raw string was: '${rawPnlString}'`
                );
                // Skip aggregation if NaN
                return;
              }

              aggregatedPnL[owner] += pnlNumber;
            });
          } else {
            console.warn(
              `No leaderboard data returned for ${JSON.stringify(identifier)}`
            );
          }
        });

        // 5. Format and Sort
        const finalLeaderboard: AggregatedLeaderboardEntry[] = Object.entries(
          aggregatedPnL
        )
          .map(([owner, totalPnL]) => ({ owner, totalPnL }))
          .sort((a, b) => b.totalPnL - a.totalPnL);

        // Trim to top 10
        return finalLeaderboard.slice(0, 10); // Return only the top 10
      } catch (error) {
        console.error('Error in useAllTimeLeaderboard:', error);
        return []; // Return empty array on error
      }
    },
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
};

// Query hook for crypto prices
const useCryptoPrices = () => {
  return useQuery({
    queryKey: ['cryptoPrices'],
    queryFn: async () => {
      try {
        const response = await foilApi.get('/crypto-prices');

        // The response itself is the data object, not response.data
        const prices = {
          ethereum: { usd: response?.eth ?? null },
          bitcoin: { usd: response?.btc ?? null },
          solana: { usd: response?.sol ?? null },
        };
        // Ensure prices are numbers or null
        prices.ethereum.usd =
          prices.ethereum.usd !== null ? Number(prices.ethereum.usd) : null;
        prices.bitcoin.usd =
          prices.bitcoin.usd !== null ? Number(prices.bitcoin.usd) : null;
        prices.solana.usd =
          prices.solana.usd !== null ? Number(prices.solana.usd) : null;

        // Check for NaN explicitly after conversion
        if (Number.isNaN(prices.ethereum.usd as number)) {
          console.warn(
            'Ethereum price is NaN after conversion. API response:',
            response?.eth
          );
          prices.ethereum.usd = null; // Fallback to null if NaN
        }
        if (Number.isNaN(prices.bitcoin.usd as number)) {
          console.warn(
            'Bitcoin price is NaN after conversion. API response:',
            response?.btc
          );
          prices.bitcoin.usd = null;
        }
        if (Number.isNaN(prices.solana.usd as number)) {
          console.warn(
            'Solana price is NaN after conversion. API response:',
            response?.sol
          );
          prices.solana.usd = null;
        }

        return prices;
      } catch (error) {
        console.error('Error fetching crypto prices:', error);
        return {
          ethereum: { usd: null },
          bitcoin: { usd: null },
          solana: { usd: null },
        };
      }
    },
    staleTime: 60 * 1000, // 1 minute
  });
};

// Query hook for stETH per token data
const useStEthPerToken = (chainId = 1) => {
  return useQuery({
    queryKey: ['stEthPerToken', chainId],
    queryFn: async () => {
      try {
        const response = await foilApi.get(
          `/getStEthPerTokenAtTimestamps?chainId=${chainId}`
        );

        // The stEthPerToken is directly in the response, not in response.data
        if (
          response?.stEthPerToken &&
          typeof response.stEthPerToken === 'string'
        ) {
          return response.stEthPerToken;
        }
        console.warn('Using fallback stEthPerToken');
        // Return a fallback value - typical stETH/wstETH ratio is around 1.1
        // Multiply by 1e18 to match the expected format from the API
        return '1100000000000000000'; // ~1.1 stETH per wstETH
      } catch (error) {
        console.error('Error fetching stEthPerToken:', error);
        console.warn('Using fallback stEthPerToken due to error');
        // Return a fallback value
        return '1100000000000000000'; // ~1.1 stETH per wstETH
      }
    },
    staleTime: 60 * 1000, // 1 minute
  });
};

// --- Main Hook ---

export const useLeaderboard = () => {
  const { data: leaderboardData, isLoading } = useAllTimeLeaderboard();
  const { data: cryptoPrices } = useCryptoPrices();
  const { data: stEthPerToken } = useStEthPerToken(); // Using default chainId 1
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('all');

  // Calculate wstETH price in USD
  const ethPriceUsd = cryptoPrices?.ethereum?.usd || null;
  const stEthPerTokenNormalized =
    stEthPerToken && typeof stEthPerToken === 'string'
      ? Number(stEthPerToken) / 1e18
      : null;
  const wstEthPriceUsd =
    stEthPerTokenNormalized !== null && ethPriceUsd !== null
      ? stEthPerTokenNormalized * ethPriceUsd
      : null;

  return {
    leaderboardData,
    isLoading,
    wstEthPriceUsd,
    selectedTimeframe,
    setSelectedTimeframe,
  };
};

// Export the interface for use in the component
export type { AggregatedLeaderboardEntry };

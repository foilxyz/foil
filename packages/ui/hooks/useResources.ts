import { useQuery } from '@tanstack/react-query';

import { graphqlRequest } from '../lib';
import { RESOURCE_ORDER, type ResourceSlug } from '../types/resources';
import { CandleType } from '../types';
import type { 
  GetResourcesQuery, 
  GetResourceCandlesQuery, 
  GetIndexCandlesQuery
} from '../types/graphql';

const LATEST_RESOURCE_PRICE_QUERY = /* GraphQL */ `
  query GetLatestResourcePrice($slug: String!, $from: Int!, $to: Int!, $interval: Int!) {
    resourceCandlesFromCache(
      slug: $slug
      from: $from
      to: $to
      interval: $interval
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const LATEST_INDEX_PRICE_QUERY = /* GraphQL */ `
  query GetLatestIndexPrice($address: String!, $chainId: Int!, $marketId: String!, $from: Int!, $to: Int!, $interval: Int!) {
    indexCandlesFromCache(
      address: $address
      chainId: $chainId
      marketId: $marketId
      from: $from
      to: $to
      interval: $interval
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const RESOURCES_QUERY = /* GraphQL */ `
  query GetResources {
    resources {
      id
      name
      slug
      marketGroups {
        id
        address
        isBridged
        chainId
        market {
          id
          marketId
          startTimestamp
          endTimestamp
          public
          question
        }
      }
    }
  }
`;

export const useResources = () => {
  return useQuery<(GetResourcesQuery['resources'][0] & { iconPath: string })[]>({
    queryKey: ['resources'],
    queryFn: async () => {
      const data = await graphqlRequest<GetResourcesQuery>(RESOURCES_QUERY);
      
      const resources = data.resources.sort((a: any, b: any) => {
        const indexA = RESOURCE_ORDER.indexOf(a.slug as ResourceSlug);
        const indexB = RESOURCE_ORDER.indexOf(b.slug as ResourceSlug);
        return indexA - indexB;
      });

      return resources.map((resource: any) => ({
        ...resource,
        iconPath: `/resources/${resource.slug}.svg`,
      }));
    },
  });
};

export const useLatestResourcePrice = (slug: string) => {
  return useQuery<{ timestamp: string; value: string }>({
    queryKey: ['resourcePrice', slug],
    queryFn: async () => {
      const from = Math.floor(Date.now() / 1000) - 300; // Last 5 minutes
      const to = Math.floor(Date.now() / 1000);
      const interval = 60; // 1 minute intervals

      const data = await graphqlRequest<GetResourceCandlesQuery>(
        LATEST_RESOURCE_PRICE_QUERY,
        { slug, from, to, interval }
      );

      const candles = data.resourceCandlesFromCache.data as CandleType[];
      if (!candles || candles.length === 0) {
        throw new Error('No price data found');
      }

      // Find the latest candle by timestamp
      const latestCandle = candles.reduce((latest: CandleType | null, current: CandleType) => {
        if (!latest || current.timestamp > latest.timestamp) {
          return current;
        }
        return latest;
      }, null);

      if (!latestCandle) {
        throw new Error('No price data found');
      }

      return {
        timestamp: latestCandle.timestamp.toString(),
        value: latestCandle.close,
      };
    },
    refetchInterval: 6000,
  });
};

export const useLatestIndexPrice = (market: {
  address: string;
  chainId: number;
  marketId: number;
}) => {
  return useQuery<{ timestamp: string; value: string } | null>({
    queryKey: [
      'indexPrice',
      `${market.chainId}:${market.address}`,
      market.marketId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.marketId === 0) {
        return null;
      }

      const from = Math.floor(Date.now() / 1000) - 300; // Last 5 minutes
      const to = Math.floor(Date.now() / 1000);
      const interval = 60; // 1 minute intervals

      const data = await graphqlRequest<GetIndexCandlesQuery>(
        LATEST_INDEX_PRICE_QUERY,
        {
          address: market.address,
          chainId: market.chainId,
          marketId: market.marketId.toString(),
          from,
          to,
          interval,
        }
      );

      const candles = data.indexCandlesFromCache.data as CandleType[];
      if (!candles || candles.length === 0) {
        throw new Error('No index price data found');
      }

      // Find the latest candle by timestamp
      const latestCandle = candles.reduce((latest: CandleType | null, current: CandleType) => {
        if (!latest || current.timestamp > latest.timestamp) {
          return current;
        }
        return latest;
      }, null);

      if (!latestCandle) {
        throw new Error('No index price data found');
      }

      return {
        timestamp: latestCandle.timestamp.toString(),
        value: latestCandle.close,
      };
    },
    refetchInterval: 12000, // Refetch every 12 seconds (approx ETH block time)
    enabled: !!market.address && !!market.chainId && market.marketId !== 0,
  });
};

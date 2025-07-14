import { Arg, FieldResolver, Int, Query, Resolver, Root } from 'type-graphql';
import type { market } from '../../../generated/prisma';
import prisma from '../../db';
import { Market } from '../types/PrismaTypes';

@Resolver(() => Market)
export class MarketResolver {
  @Query(() => [Market])
  async markets(
    @Arg('marketId', () => Int) marketId: number,
    @Arg('chainId', () => Int) chainId: number,
    @Arg('marketAddress', () => String) marketAddress: string
  ): Promise<Market[]> {
    try {
      const markets = await prisma.market.findMany({
        where: {
          marketId: marketId,
          market_group: {
            chainId: chainId,
            address: marketAddress.toLowerCase(),
          },
        },
        include: {
          market_group: {
            include: {
              market: true,
              resource: true,
            },
          },
        },
      });

      console.log('markets', markets);
      return markets as Market[];
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }

  @FieldResolver(() => String, { nullable: true })
  async currentPrice(@Root() market: market): Promise<string | null> {
    if (market.settled) {
      return null;
    }

    try {
      // We need to find the latest MarketPrice associated with this Market.
      // The path is Market -> Position -> Transaction -> MarketPrice.
      const latestMarketPrice = await prisma.market_price.findFirst({
        where: {
          transaction: {
            position: {
              market: {
                id: market.id,
              },
            },
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        include: {
          transaction: {
            include: {
              position: {
                include: {
                  market: true,
                },
              },
            },
          },
        },
      });

      return latestMarketPrice ? latestMarketPrice.value.toString() : null;
    } catch (e) {
      console.error(`Error fetching currentPrice for market ${market.id}:`, e);
      return null;
    }
  }
}

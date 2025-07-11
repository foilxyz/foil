import {
  Resolver,
  Query,
  Arg,
  Int,
  FieldResolver,
  Root,
  InputType,
  Field,
} from 'type-graphql';
import prisma from '../../db';
import { MarketGroup, Market } from '../types/PrismaTypes';
import type { market_group, market, Prisma } from '../../../generated/prisma';

@InputType()
export class MarketFilterInput {
  @Field(() => String, { nullable: true })
  endTimestamp_gt?: string;
}

@InputType()
export class MarketOrderInput {
  @Field(() => String)
  field: 'endTimestamp';

  @Field(() => String)
  direction: 'ASC' | 'DESC';
}

@Resolver(() => MarketGroup)
export class MarketGroupResolver {
  @Query(() => [MarketGroup])
  async marketGroups(
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('collateralAsset', () => String, { nullable: true })
    collateralAsset?: string,
    @Arg('baseTokenName', () => String, { nullable: true })
    baseTokenName?: string
  ): Promise<MarketGroup[]> {
    try {
      const whereConditions: Prisma.market_groupWhereInput = {};

      if (chainId !== undefined) {
        whereConditions.chainId = chainId;
      }

      if (collateralAsset !== undefined) {
        whereConditions.collateralAsset = collateralAsset;
      }

      if (baseTokenName !== undefined) {
        whereConditions.baseTokenName = baseTokenName;
      }

      const marketGroups = await prisma.market_group.findMany({
        where: whereConditions,
        include: {
          market: true,
          category: true,
          resource: true,
        },
      });

      return marketGroups as MarketGroup[];
    } catch (error) {
      console.error('Error fetching market groups:', error);
      throw new Error('Failed to fetch market groups');
    }
  }

  @Query(() => MarketGroup, { nullable: true })
  async marketGroup(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string
  ): Promise<MarketGroup | null> {
    try {
      const marketGroup = await prisma.market_group.findFirst({
        where: {
          chainId,
          address: address.toLowerCase(),
        },
        include: {
          market: true,
          category: true,
          resource: true,
        },
      });

      if (!marketGroup) return null;

      return marketGroup as MarketGroup;
    } catch (error) {
      console.error('Error fetching market group:', error);
      throw new Error('Failed to fetch market group');
    }
  }

  @FieldResolver(() => [Market])
  async markets(
    @Root() marketGroup: market_group & { market?: market[] },
    @Arg('filter', () => MarketFilterInput, { nullable: true })
    filter?: MarketFilterInput,
    @Arg('orderBy', () => MarketOrderInput, { nullable: true })
    orderBy?: MarketOrderInput
  ): Promise<Market[]> {
    try {
      let markets = marketGroup.market;

      if (!markets) {
        const whereConditions: Prisma.marketWhereInput = {
          marketGroupId: marketGroup.id,
        };

        if (filter?.endTimestamp_gt) {
          whereConditions.endTimestamp = {
            gt: parseInt(filter.endTimestamp_gt, 10),
          };
        }

        const orderByCondition: Prisma.marketOrderByWithRelationInput = {};
        if (orderBy?.field === 'endTimestamp') {
          orderByCondition.endTimestamp = orderBy.direction.toLowerCase() as
            | 'asc'
            | 'desc';
        } else {
          orderByCondition.endTimestamp = 'asc';
        }

        markets = await prisma.market.findMany({
          where: whereConditions,
          orderBy: orderByCondition,
        });
      } else {
        if (filter?.endTimestamp_gt) {
          const endTimestampGt = parseInt(filter.endTimestamp_gt, 10);
          markets = markets.filter(
            (m: market) => m.endTimestamp && m.endTimestamp > endTimestampGt
          );
        }

        if (orderBy?.field === 'endTimestamp') {
          markets.sort((a: market, b: market) => {
            const timeA = a.endTimestamp || 0;
            const timeB = b.endTimestamp || 0;
            if (orderBy.direction === 'ASC') {
              return timeA - timeB;
            } else {
              return timeB - timeA;
            }
          });
        } else {
          markets.sort(
            (a: market, b: market) =>
              (a.endTimestamp || 0) - (b.endTimestamp || 0)
          );
        }
      }

      return markets as Market[];
    } catch (error) {
      console.error('Error fetching markets for market group:', error);
      throw new Error('Failed to fetch markets');
    }
  }

  @FieldResolver(() => String)
  async classification(
    @Root() marketGroup: market_group & { market?: market[] }
  ): Promise<string> {
    try {
      let markets = marketGroup.market;

      if (!markets) {
        markets = await prisma.market.findMany({
          where: { marketGroupId: marketGroup.id },
        });
      }

      if (!markets?.length) {
        console.warn(
          '[classification] Invalid or empty market group data, defaulting to NUMERIC.'
        );
        return '3'; // numeric based on frontend enum
      }

      if (markets.length > 1) {
        const endTimeCounts = new Map<string | number, number>();
        for (const market of markets) {
          if (
            market.endTimestamp !== null &&
            market.endTimestamp !== undefined
          ) {
            const key =
              typeof market.endTimestamp === 'number' ||
              typeof market.endTimestamp === 'string'
                ? market.endTimestamp
                : String(market.endTimestamp);
            endTimeCounts.set(key, (endTimeCounts.get(key) || 0) + 1);
          }
        }

        for (const count of Array.from(endTimeCounts.values())) {
          if (count > 1) {
            return '1'; // multiple choice based on frontend enum
          }
        }
      }

      // Check for YES_NO based on baseTokenName
      if (marketGroup.baseTokenName === 'Yes') {
        return '2'; // yes no based on frontend enum
      }

      return '3'; // numeric based on frontend enum
    } catch (error) {
      console.error('Error computing market group classification:', error);
      return '3'; // default to numeric on error
    }
  }
}

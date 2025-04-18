import { Resolver, Query, Arg, Int, FieldResolver, Root } from 'type-graphql';
import dataSource from '../../db';
import { MarketGroup } from '../../models/MarketGroup';
import { Market } from '../../models/Market';
import { MarketType, MarketGroupType } from '../types';
import { mapMarketGroupToType, mapMarketToType } from './mappers';

@Resolver(() => MarketGroupType)
export class MarketGroupResolver {
  @Query(() => [MarketGroupType])
  async marketGroups(): Promise<MarketGroupType[]> {
    try {
      const marketGroups = await dataSource.getRepository(MarketGroup).find({
        relations: ['markets', 'category'],
      });
      return marketGroups.map(mapMarketGroupToType);
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }

  @Query(() => MarketGroupType, { nullable: true })
  async marketGroup(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string
  ): Promise<MarketGroupType | null> {
    try {
      const marketGroup = await dataSource.getRepository(MarketGroup).findOne({
        where: { chainId, address: address.toLowerCase() },
        relations: ['markets', 'category'],
      });

      if (!marketGroup) return null;

      return mapMarketGroupToType(marketGroup);
    } catch (error) {
      console.error('Error fetching market group:', error);
      throw new Error('Failed to fetch market group');
    }
  }

  @FieldResolver(() => [MarketType])
  async markets(@Root() marketGroup: MarketGroup): Promise<MarketType[]> {
    try {
      // If epochs are already loaded, return them
      if (marketGroup.markets) {
        return marketGroup.markets.map(mapMarketToType);
      }

      // Otherwise fetch them
      const markets = await dataSource.getRepository(Market).find({
        where: { marketGroup: { id: marketGroup.id } },
      });

      return markets.map(mapMarketToType);
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }
}

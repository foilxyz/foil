import 'reflect-metadata';
import { buildSchema } from 'type-graphql';
import { relationResolvers } from '@generated/type-graphql';
import { prisma } from './resolvers/GeneratedResolvers';
import { SharedSchema } from './sharedSchema';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import depthLimit from 'graphql-depth-limit';

// Import only the query (read-only) resolvers from generated TypeGraphQL
import {
  // Cache_candle queries
  AggregateCache_candleResolver,
  FindFirstCache_candleResolver,
  FindFirstCache_candleOrThrowResolver,
  FindManyCache_candleResolver,
  FindUniqueCache_candleResolver,
  FindUniqueCache_candleOrThrowResolver,
  GroupByCache_candleResolver,

  // Cache_param queries
  AggregateCache_paramResolver,
  FindFirstCache_paramResolver,
  FindFirstCache_paramOrThrowResolver,
  FindManyCache_paramResolver,
  FindUniqueCache_paramResolver,
  FindUniqueCache_paramOrThrowResolver,
  GroupByCache_paramResolver,

  // Category queries
  AggregateCategoryResolver,
  FindFirstCategoryResolver,
  FindFirstCategoryOrThrowResolver,
  FindManyCategoryResolver,
  FindUniqueCategoryResolver,
  FindUniqueCategoryOrThrowResolver,
  GroupByCategoryResolver,

  // Collateral_transfer queries
  AggregateCollateral_transferResolver,
  FindFirstCollateral_transferResolver,
  FindFirstCollateral_transferOrThrowResolver,
  FindManyCollateral_transferResolver,
  FindUniqueCollateral_transferResolver,
  FindUniqueCollateral_transferOrThrowResolver,
  GroupByCollateral_transferResolver,

  // Crypto_prices queries
  AggregateCrypto_pricesResolver,
  FindFirstCrypto_pricesResolver,
  FindFirstCrypto_pricesOrThrowResolver,
  FindManyCrypto_pricesResolver,
  FindUniqueCrypto_pricesResolver,
  FindUniqueCrypto_pricesOrThrowResolver,
  GroupByCrypto_pricesResolver,

  // Event queries
  AggregateEventResolver,
  FindFirstEventResolver,
  FindFirstEventOrThrowResolver,
  FindManyEventResolver,
  FindUniqueEventResolver,
  FindUniqueEventOrThrowResolver,
  GroupByEventResolver,

  // Market queries
  AggregateMarketResolver,
  FindFirstMarketResolver,
  FindFirstMarketOrThrowResolver,
  FindManyMarketResolver,
  FindUniqueMarketResolver,
  FindUniqueMarketOrThrowResolver,
  GroupByMarketResolver,

  // Market_group queries
  AggregateMarket_groupResolver,
  FindFirstMarket_groupResolver,
  FindFirstMarket_groupOrThrowResolver,
  FindManyMarket_groupResolver,
  FindUniqueMarket_groupResolver,
  FindUniqueMarket_groupOrThrowResolver,
  GroupByMarket_groupResolver,

  // Market_price queries
  AggregateMarket_priceResolver,
  FindFirstMarket_priceResolver,
  FindFirstMarket_priceOrThrowResolver,
  FindManyMarket_priceResolver,
  FindUniqueMarket_priceResolver,
  FindUniqueMarket_priceOrThrowResolver,
  GroupByMarket_priceResolver,

  // Migrations queries
  AggregateMigrationsResolver,
  FindFirstMigrationsResolver,
  FindFirstMigrationsOrThrowResolver,
  FindManyMigrationsResolver,
  FindUniqueMigrationsResolver,
  FindUniqueMigrationsOrThrowResolver,
  GroupByMigrationsResolver,

  // Position queries
  AggregatePositionResolver,
  FindFirstPositionResolver,
  FindFirstPositionOrThrowResolver,
  FindManyPositionResolver,
  FindUniquePositionResolver,
  FindUniquePositionOrThrowResolver,
  GroupByPositionResolver,

  // Render_job queries
  AggregateRender_jobResolver,
  FindFirstRender_jobResolver,
  FindFirstRender_jobOrThrowResolver,
  FindManyRender_jobResolver,
  FindUniqueRender_jobResolver,
  FindUniqueRender_jobOrThrowResolver,
  GroupByRender_jobResolver,

  // Resource queries
  AggregateResourceResolver,
  FindFirstResourceResolver,
  FindFirstResourceOrThrowResolver,
  FindManyResourceResolver,
  FindUniqueResourceResolver,
  FindUniqueResourceOrThrowResolver,
  GroupByResourceResolver,

  // Resource_price queries
  AggregateResource_priceResolver,
  FindFirstResource_priceResolver,
  FindFirstResource_priceOrThrowResolver,
  FindManyResource_priceResolver,
  FindUniqueResource_priceResolver,
  FindUniqueResource_priceOrThrowResolver,
  GroupByResource_priceResolver,

  // Transaction queries
  AggregateTransactionResolver,
  FindFirstTransactionResolver,
  FindFirstTransactionOrThrowResolver,
  FindManyTransactionResolver,
  FindUniqueTransactionResolver,
  FindUniqueTransactionOrThrowResolver,
  GroupByTransactionResolver,
} from '@generated/type-graphql';

// Import the custom resolvers to keep
import { CandleResolver, PnLResolver, VolumeResolver } from './resolvers';

export interface ApolloContext {
  prisma: typeof prisma;
}

export const initializeApolloServer = async () => {
  // Define the query-only resolvers
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const queryResolvers: Function[] = [
    // Cache_candle queries
    AggregateCache_candleResolver,
    FindFirstCache_candleResolver,
    FindFirstCache_candleOrThrowResolver,
    FindManyCache_candleResolver,
    FindUniqueCache_candleResolver,
    FindUniqueCache_candleOrThrowResolver,
    GroupByCache_candleResolver,

    // Cache_param queries
    AggregateCache_paramResolver,
    FindFirstCache_paramResolver,
    FindFirstCache_paramOrThrowResolver,
    FindManyCache_paramResolver,
    FindUniqueCache_paramResolver,
    FindUniqueCache_paramOrThrowResolver,
    GroupByCache_paramResolver,

    // Category queries
    AggregateCategoryResolver,
    FindFirstCategoryResolver,
    FindFirstCategoryOrThrowResolver,
    FindManyCategoryResolver,
    FindUniqueCategoryResolver,
    FindUniqueCategoryOrThrowResolver,
    GroupByCategoryResolver,

    // Collateral_transfer queries
    AggregateCollateral_transferResolver,
    FindFirstCollateral_transferResolver,
    FindFirstCollateral_transferOrThrowResolver,
    FindManyCollateral_transferResolver,
    FindUniqueCollateral_transferResolver,
    FindUniqueCollateral_transferOrThrowResolver,
    GroupByCollateral_transferResolver,

    // Crypto_prices queries
    AggregateCrypto_pricesResolver,
    FindFirstCrypto_pricesResolver,
    FindFirstCrypto_pricesOrThrowResolver,
    FindManyCrypto_pricesResolver,
    FindUniqueCrypto_pricesResolver,
    FindUniqueCrypto_pricesOrThrowResolver,
    GroupByCrypto_pricesResolver,

    // Event queries
    AggregateEventResolver,
    FindFirstEventResolver,
    FindFirstEventOrThrowResolver,
    FindManyEventResolver,
    FindUniqueEventResolver,
    FindUniqueEventOrThrowResolver,
    GroupByEventResolver,

    // Market queries
    AggregateMarketResolver,
    FindFirstMarketResolver,
    FindFirstMarketOrThrowResolver,
    FindManyMarketResolver,
    FindUniqueMarketResolver,
    FindUniqueMarketOrThrowResolver,
    GroupByMarketResolver,

    // Market_group queries
    AggregateMarket_groupResolver,
    FindFirstMarket_groupResolver,
    FindFirstMarket_groupOrThrowResolver,
    FindManyMarket_groupResolver,
    FindUniqueMarket_groupResolver,
    FindUniqueMarket_groupOrThrowResolver,
    GroupByMarket_groupResolver,

    // Market_price queries
    AggregateMarket_priceResolver,
    FindFirstMarket_priceResolver,
    FindFirstMarket_priceOrThrowResolver,
    FindManyMarket_priceResolver,
    FindUniqueMarket_priceResolver,
    FindUniqueMarket_priceOrThrowResolver,
    GroupByMarket_priceResolver,

    // Migrations queries
    AggregateMigrationsResolver,
    FindFirstMigrationsResolver,
    FindFirstMigrationsOrThrowResolver,
    FindManyMigrationsResolver,
    FindUniqueMigrationsResolver,
    FindUniqueMigrationsOrThrowResolver,
    GroupByMigrationsResolver,

    // Position queries
    AggregatePositionResolver,
    FindFirstPositionResolver,
    FindFirstPositionOrThrowResolver,
    FindManyPositionResolver,
    FindUniquePositionResolver,
    FindUniquePositionOrThrowResolver,
    GroupByPositionResolver,

    // Render_job queries
    AggregateRender_jobResolver,
    FindFirstRender_jobResolver,
    FindFirstRender_jobOrThrowResolver,
    FindManyRender_jobResolver,
    FindUniqueRender_jobResolver,
    FindUniqueRender_jobOrThrowResolver,
    GroupByRender_jobResolver,

    // Resource queries
    AggregateResourceResolver,
    FindFirstResourceResolver,
    FindFirstResourceOrThrowResolver,
    FindManyResourceResolver,
    FindUniqueResourceResolver,
    FindUniqueResourceOrThrowResolver,
    GroupByResourceResolver,

    // Resource_price queries
    AggregateResource_priceResolver,
    FindFirstResource_priceResolver,
    FindFirstResource_priceOrThrowResolver,
    FindManyResource_priceResolver,
    FindUniqueResource_priceResolver,
    FindUniqueResource_priceOrThrowResolver,
    GroupByResource_priceResolver,

    // Transaction queries
    AggregateTransactionResolver,
    FindFirstTransactionResolver,
    FindFirstTransactionOrThrowResolver,
    FindManyTransactionResolver,
    FindUniqueTransactionResolver,
    FindUniqueTransactionOrThrowResolver,
    GroupByTransactionResolver,
  ];

  // Build the GraphQL schema with query resolvers, relation resolvers, and custom resolvers
  const allResolvers = queryResolvers
    .concat(relationResolvers)
    .concat([CandleResolver, PnLResolver, VolumeResolver]);
  const schema = await buildSchema({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvers: allResolvers as any,
    validate: false,
  });

  // Create Apollo Server with the combined schema and depth limit
  const apolloServer = new ApolloServer({
    schema,
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return error;
    },
    introspection: true,
    plugins: [
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
      responseCachePlugin(),
    ],
    validationRules: [depthLimit(5)],
  });

  await apolloServer.start();

  // Get the singleton instance
  const sharedSchema = SharedSchema.getInstance();

  // Set the combined schema (with both generated and custom resolvers)
  sharedSchema.setSchema(schema);

  return apolloServer;
};

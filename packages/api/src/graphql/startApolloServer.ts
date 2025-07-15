import 'reflect-metadata';
import { buildSchema } from 'type-graphql';
import { relationResolvers } from '@generated/type-graphql';
import { prisma } from './resolvers/GeneratedResolvers';
import { SharedSchema } from './sharedSchema';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import depthLimit from 'graphql-depth-limit';
import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';

// Import only the query (read-only) resolvers from generated TypeGraphQL
import {
  // Category queries
  AggregateCategoryResolver,
  FindFirstCategoryResolver,
  FindFirstCategoryOrThrowResolver,
  FindManyCategoryResolver,
  FindUniqueCategoryResolver,
  FindUniqueCategoryOrThrowResolver,
  GroupByCategoryResolver,

  // CryptoPrices queries
  AggregateCryptoPricesResolver,
  FindFirstCryptoPricesResolver,
  FindFirstCryptoPricesOrThrowResolver,
  FindManyCryptoPricesResolver,
  FindUniqueCryptoPricesResolver,
  FindUniqueCryptoPricesOrThrowResolver,
  GroupByCryptoPricesResolver,

  // Market queries
  AggregateMarketResolver,
  FindFirstMarketResolver,
  FindFirstMarketOrThrowResolver,
  FindManyMarketResolver,
  FindUniqueMarketResolver,
  FindUniqueMarketOrThrowResolver,
  GroupByMarketResolver,

  // MarketGroup queries
  AggregateMarketGroupResolver,
  FindFirstMarketGroupResolver,
  FindFirstMarketGroupOrThrowResolver,
  FindManyMarketGroupResolver,
  FindUniqueMarketGroupResolver,
  FindUniqueMarketGroupOrThrowResolver,
  GroupByMarketGroupResolver,

  // MarketPrice queries
  AggregateMarketPriceResolver,
  FindFirstMarketPriceResolver,
  FindFirstMarketPriceOrThrowResolver,
  FindManyMarketPriceResolver,
  FindUniqueMarketPriceResolver,
  FindUniqueMarketPriceOrThrowResolver,
  GroupByMarketPriceResolver,

  // Position queries
  AggregatePositionResolver,
  FindFirstPositionResolver,
  FindFirstPositionOrThrowResolver,
  FindManyPositionResolver,
  FindUniquePositionResolver,
  FindUniquePositionOrThrowResolver,
  GroupByPositionResolver,

  // Resource queries
  AggregateResourceResolver,
  FindFirstResourceResolver,
  FindFirstResourceOrThrowResolver,
  FindManyResourceResolver,
  FindUniqueResourceResolver,
  FindUniqueResourceOrThrowResolver,
  GroupByResourceResolver,

  // ResourcePrice queries
  AggregateResourcePriceResolver,
  FindFirstResourcePriceResolver,
  FindFirstResourcePriceOrThrowResolver,
  FindManyResourcePriceResolver,
  FindUniqueResourcePriceResolver,
  FindUniqueResourcePriceOrThrowResolver,
  GroupByResourcePriceResolver,

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
    // Category queries
    AggregateCategoryResolver,
    FindFirstCategoryResolver,
    FindFirstCategoryOrThrowResolver,
    FindManyCategoryResolver,
    FindUniqueCategoryResolver,
    FindUniqueCategoryOrThrowResolver,
    GroupByCategoryResolver,

    // CryptoPrices queries
    AggregateCryptoPricesResolver,
    FindFirstCryptoPricesResolver,
    FindFirstCryptoPricesOrThrowResolver,
    FindManyCryptoPricesResolver,
    FindUniqueCryptoPricesResolver,
    FindUniqueCryptoPricesOrThrowResolver,
    GroupByCryptoPricesResolver,

    // Market queries
    AggregateMarketResolver,
    FindFirstMarketResolver,
    FindFirstMarketOrThrowResolver,
    FindManyMarketResolver,
    FindUniqueMarketResolver,
    FindUniqueMarketOrThrowResolver,
    GroupByMarketResolver,

    // MarketGroup queries
    AggregateMarketGroupResolver,
    FindFirstMarketGroupResolver,
    FindFirstMarketGroupOrThrowResolver,
    FindManyMarketGroupResolver,
    FindUniqueMarketGroupResolver,
    FindUniqueMarketGroupOrThrowResolver,
    GroupByMarketGroupResolver,

    // MarketPrice queries
    AggregateMarketPriceResolver,
    FindFirstMarketPriceResolver,
    FindFirstMarketPriceOrThrowResolver,
    FindManyMarketPriceResolver,
    FindUniqueMarketPriceResolver,
    FindUniqueMarketPriceOrThrowResolver,
    GroupByMarketPriceResolver,

    // Position queries
    AggregatePositionResolver,
    FindFirstPositionResolver,
    FindFirstPositionOrThrowResolver,
    FindManyPositionResolver,
    FindUniquePositionResolver,
    FindUniquePositionOrThrowResolver,
    GroupByPositionResolver,

    // Resource queries
    AggregateResourceResolver,
    FindFirstResourceResolver,
    FindFirstResourceOrThrowResolver,
    FindManyResourceResolver,
    FindUniqueResourceResolver,
    FindUniqueResourceOrThrowResolver,
    GroupByResourceResolver,

    // ResourcePrice queries
    AggregateResourcePriceResolver,
    FindFirstResourcePriceResolver,
    FindFirstResourcePriceOrThrowResolver,
    FindManyResourcePriceResolver,
    FindUniqueResourcePriceResolver,
    FindUniqueResourcePriceOrThrowResolver,
    GroupByResourcePriceResolver,

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
    emitSchemaFile: true,
  });

  // Copy the generated schema to the sapience folder (only in non-production environments)
  if (process.env.NODE_ENV !== 'production') {
    try {
      const sourceSchemaPath = join(process.cwd(), 'schema.graphql');
      const targetSchemaPath = join(process.cwd(), '../sapience/src/schema.graphql');
      
      if (existsSync(sourceSchemaPath)) {
        copyFileSync(sourceSchemaPath, targetSchemaPath);
        console.log('✅ GraphQL schema copied to sapience folder');
      } else {
        console.warn('⚠️  Schema file not found at expected location:', sourceSchemaPath);
      }
    } catch (error) {
      console.error('❌ Failed to copy schema to sapience folder:', error);
    }
  } else {
    console.log('ℹ️  Skipping schema copy in production environment');
  }

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

import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import depthLimit from 'graphql-depth-limit';
import { buildSchema } from 'type-graphql';
import {
  MarketGroupResolver,
  PositionResolver,
  TransactionResolver,
  CandleResolver,
  PnLResolver,
  VolumeResolver,
  MarketResolver,
} from './resolvers';
import { SharedSchema } from './sharedSchema';
import { readOnlyResolvers } from './resolvers/GeneratedResolvers';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApolloContext {}

export const initializeApolloServer = async () => {
  // Create GraphQL schema
  const schema = await buildSchema({
    resolvers: [
      MarketGroupResolver,
      MarketResolver,
      PositionResolver,
      TransactionResolver,
      CandleResolver,
      PnLResolver,
      VolumeResolver,
      ...readOnlyResolvers,
    ],
    emitSchemaFile: true,
    validate: false,
  });

  // Create Apollo Server
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

  // Start Apollo Server
  await apolloServer.start();

  // Get the singleton instance
  const sharedSchema = SharedSchema.getInstance();

  // Set the schema
  sharedSchema.setSchema(schema);

  return apolloServer;
};

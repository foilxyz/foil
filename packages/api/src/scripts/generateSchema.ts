import { buildSchema } from 'type-graphql';
import {
  MarketGroupResolver,
  MarketResolver,
  PositionResolver,
  ResourceResolver,
  TransactionResolver,
  VolumeResolver,
  CategoryResolver,
} from '../graphql/resolvers';

async function generateSchema() {
  try {
    await buildSchema({
      resolvers: [
        MarketResolver,
        ResourceResolver,
        PositionResolver,
        TransactionResolver,
        MarketGroupResolver,
        VolumeResolver,
        CategoryResolver,
      ],
      emitSchemaFile: true,
      validate: false,
    });
    console.log('Schema generated successfully!');
  } catch (error) {
    console.error('Error generating schema:', error);
  }
}

generateSchema();

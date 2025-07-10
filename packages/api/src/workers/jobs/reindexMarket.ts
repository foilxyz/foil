import Sapience from '@sapience/protocol/deployments/Sapience.json';
import * as Sentry from '@sentry/node';
import { Abi } from 'viem';
import {
  initializeMarket,
  reindexMarketGroupEvents,
} from '../../controllers/market';
import prisma, { initializeDataSource } from '../../db';
import { INDEXERS } from '../../fixtures';

export async function reindexMarket(
  chainId: number,
  address: string,
  marketId: string
) {
  try {
    console.log(
      'reindexing market group',
      address,
      'on chain',
      chainId,
      'market',
      marketId
    );

    await initializeDataSource();

    // Find the market in the database instead of using MARKETS
    const marketEntity = await prisma.marketGroup.findFirst({
      where: {
        chainId,
        address: address.toLowerCase(),
      },
      include: {
        resource: true,
      },
    });

    if (!marketEntity) {
      throw new Error(
        `Market not found for chainId ${chainId} and address ${address}`
      );
    }

    // Create a market info object that matches the marketInfo interface
    const marketInfo = {
      marketChainId: chainId,
      deployment: {
        address,
        abi: Sapience.abi as Abi,
        deployTimestamp: marketEntity.deployTimestamp?.toString() || '0',
        deployTxnBlockNumber:
          marketEntity.deployTxnBlockNumber?.toString() || '0',
      },
      isCumulative: marketEntity.isCumulative || false,
      isBridged: marketEntity.isBridged || false,
      resource: {
        name: marketEntity.resource?.name,
        priceIndexer: marketEntity.resource
          ? INDEXERS[marketEntity.resource.slug]
          : null,
      },
    };

    const market = await initializeMarket(marketInfo);

    await Promise.all([
      // Pass only the two required arguments: market
      reindexMarketGroupEvents(market),
    ]);

    console.log('finished reindexing market', address, 'on chain', chainId);
  } catch (error) {
    console.error('Error in reindexMarket:', error);
    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setExtra('chainId', chainId);
      scope.setExtra('address', address);
      scope.setExtra('marketId', marketId);
      Sentry.captureException(error);
    });
    throw error;
  }
}

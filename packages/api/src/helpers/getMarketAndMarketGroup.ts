import prisma from '../db';
import type { Prisma } from '../../generated/prisma';

export const getMarketGroupAndMarket = async (
  chainId: number,
  marketAddress: string,
  marketId: number
): Promise<{
  market: Prisma.MarketGetPayload<{ include: { market_group: true } }>;
  marketGroup: Prisma.MarketGroupGetPayload<object>;
} | null> => {
  const market = await prisma.market.findFirst({
    where: {
      marketId: marketId,
      market_group: {
        address: marketAddress.toLowerCase(),
        chainId,
      },
    },
    include: {
      market_group: true,
    },
  });

  if (!market || !market.market_group) {
    return null;
  }

  return {
    market,
    marketGroup: market.market_group,
  };
};

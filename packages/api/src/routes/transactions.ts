import { Router, Request, Response } from 'express';
import { validateRequestParams } from '../helpers/validateRequestParams';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { parseContractId } from '../helpers/parseContractId';
import prisma from '../db';
import { hydrateTransactions } from '../helpers/hydrateTransactions';
import type { Prisma } from '../../generated/prisma';

const router = Router();

router.get(
  '/',
  validateRequestParams(['contractId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { contractId, marketId, positionId } = req.query as {
      contractId: string;
      marketId?: string;
      positionId?: string;
    };

    const { chainId, address } = parseContractId(contractId);

    // Build the where clause
    const whereClause: Prisma.TransactionWhereInput = {
      position: {
        market: {
          market_group: {
            chainId: parseInt(chainId),
            address: address.toLowerCase(),
          },
        },
      },
    };

    // Add optional filters
    if (marketId) {
      // Note: In the new schema, there's no direct market relationship
      // This might need to be adjusted based on your business logic
      // For now, we'll use marketId as a substitute if that's what marketId represents
      if (whereClause.position && whereClause.position.market) {
        whereClause.position.market.marketId = parseInt(marketId);
      }
    }

    if (positionId) {
      if (whereClause.position) {
        whereClause.position.positionId = parseInt(positionId);
      }
    }

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        position: {
          include: {
            market: {
              include: {
                market_group: {
                  include: {
                    resource: true,
                  },
                },
              },
            },
          },
        },
        event: true,
      },
      orderBy: [
        { position: { positionId: 'asc' } },
        { event: { blockNumber: 'asc' } },
      ],
    });

    const hydratedPositions = hydrateTransactions(transactions);

    res.json(hydratedPositions);
  })
);

export { router };

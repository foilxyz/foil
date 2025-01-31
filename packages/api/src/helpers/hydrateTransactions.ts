import { formatDbBigInt } from 'src/utils';
import { Transaction } from '../models/Transaction';

export const hydrateTransactions = (transactions: Transaction[]) => {
  const hydratedPositions = [];

  // Format data
  let lastPositionId = 0;
  let lastBaseToken = BigInt(0);
  let lastQuoteToken = BigInt(0);
  let lastCollateral = BigInt(0);
  for (const transaction of transactions) {
    transaction.tradeRatioD18 = formatDbBigInt(transaction.tradeRatioD18);

    const hydratedTransaction = {
      ...transaction,
      position: {
        ...transaction.position,
        epoch: {
          ...transaction.position?.epoch,
          market: {
            ...transaction.position?.epoch?.market,
            resource: transaction.position?.epoch?.market?.resource,
          },
        },
      },
      collateralDelta: '0',
      baseTokenDelta: '0',
      quoteTokenDelta: '0',
    };

    // if transactions come from the position.transactions it doesn't have a .position, but all the transactions correspond to the same position
    if (
      transaction.position &&
      transaction.position.positionId !== lastPositionId
    ) {
      lastBaseToken = BigInt(0);
      lastQuoteToken = BigInt(0);
      lastCollateral = BigInt(0);
      lastPositionId = transaction.position.positionId;
    }

    // If the transaction is from a liquidity position, use the lpDeltaToken values
    // Otherwise, use the baseToken and quoteToken values from the previous transaction (trade with history)
    const currentBaseTokenBalance =
      transaction.lpBaseDeltaToken ||
      BigInt(transaction.baseToken) - lastBaseToken;
    const currentQuoteTokenBalance =
      transaction.lpQuoteDeltaToken ||
      BigInt(transaction.quoteToken) - lastQuoteToken;
    const currentCollateralBalance =
      BigInt(transaction.collateral) - lastCollateral;

    hydratedTransaction.baseTokenDelta = formatDbBigInt(
      currentBaseTokenBalance.toString()
    );
    hydratedTransaction.quoteTokenDelta = formatDbBigInt(
      currentQuoteTokenBalance.toString()
    );
    hydratedTransaction.collateralDelta = formatDbBigInt(
      currentCollateralBalance.toString()
    );

    hydratedPositions.push(hydratedTransaction);

    // set up for next transaction
    lastBaseToken = BigInt(transaction.baseToken);
    lastQuoteToken = BigInt(transaction.quoteToken);
    lastCollateral = BigInt(transaction.collateral);
  }
  return hydratedPositions;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
import 'tsconfig-paths/register';
import {
  marketRepository,
  eventRepository,
  initializeDataSource,
  marketGroupRepository,
  transactionRepository,
} from '../db';
import { MarketParams } from '../models/MarketParams';
import { Event } from '../models/Event';
import { MarketGroup } from '../models/MarketGroup';
import { Transaction } from '../models/Transaction';
import { decodeEventLog, Log } from 'viem';
import {
  EpochCreatedEventLog,
  EventType,
  MarketCreatedUpdatedEventLog,
  LogData,
  MarketInfo,
} from '../interfaces';
import {
  getProviderForChain,
  bigintReplacer,
  sqrtPriceX96ToSettlementPriceD18,
  getBlockByTimestamp,
  getContractCreationBlock,
} from '../utils/utils';
import {
  createEpochFromEvent,
  createOrUpdateMarketFromEvent,
  createOrModifyPositionFromTransaction,
  handleTransferEvent,
  handlePositionSettledEvent,
  updateTransactionFromAddLiquidityEvent,
  updateTransactionFromLiquidityClosedEvent,
  updateTransactionFromLiquidityModifiedEvent,
  updateTransactionFromTradeModifiedEvent,
  insertMarketPrice,
  updateTransactionFromPositionSettledEvent,
  insertCollateralTransfer,
  createOrUpdateEpochFromContract,
  updateCollateralData,
} from './marketHelpers';
import { alertEvent } from '../workers/discordBot';
import Foil from '@foil/protocol/deployments/Foil.json';
import { PublicClient } from 'viem';
import Sentry from '../instrument';

const settledPositions: any[] = [];
// Called when the process starts, upserts markets in the database to match those in the constants.ts file
export const initializeMarket = async (marketInfo: MarketInfo) => {
  const existingMarket = await marketGroupRepository.findOne({
    where: {
      address: marketInfo.deployment.address.toLowerCase(),
      chainId: marketInfo.marketChainId,
    },
    relations: ['resource'],
  });
  const market = existingMarket || new MarketGroup();

  const client = getProviderForChain(marketInfo.marketChainId);

  const marketReadResult = (await client.readContract({
    address: marketInfo.deployment.address as `0x${string}`,
    abi: Foil.abi,
    functionName: 'getMarket',
  })) as [string, string, string, string, any];

  const updatedMarket = market;

  updatedMarket.address = marketInfo.deployment.address.toLowerCase();
  updatedMarket.vaultAddress = marketInfo.vaultAddress ?? '';
  updatedMarket.isYin = marketInfo.isYin ?? true;
  updatedMarket.isCumulative = marketInfo.isCumulative ?? false;
  updatedMarket.deployTxnBlockNumber = Number(
    marketInfo.deployment.deployTxnBlockNumber
  );
  updatedMarket.deployTimestamp = Number(marketInfo.deployment.deployTimestamp);
  updatedMarket.chainId = marketInfo.marketChainId;
  updatedMarket.owner = marketReadResult[0].toLowerCase();
  updatedMarket.collateralAsset = marketReadResult[1];
  if (updatedMarket.collateralAsset) {
    try {
      const decimals = await client.readContract({
        address: updatedMarket.collateralAsset as `0x${string}`,
        abi: [
          {
            constant: true,
            inputs: [],
            name: 'decimals',
            outputs: [{ name: '', type: 'uint8' }],
            payable: false,
            stateMutability: 'view',
            type: 'function',
          },
        ],
        functionName: 'decimals',
      });
      updatedMarket.collateralDecimals = Number(decimals);
    } catch (error) {
      console.error(
        `Failed to fetch decimals for token ${updatedMarket.collateralAsset}:`,
        error
      );
    }
  }
  const marketParamsRaw = marketReadResult[4];
  const marketEpochParams: MarketParams = {
    ...marketParamsRaw,
    assertionLiveness: marketParamsRaw?.assertionLiveness?.toString() ?? '0',
    bondAmount: marketParamsRaw?.bondAmount?.toString() ?? '0',
  };
  updatedMarket.marketParams = marketEpochParams;
  await marketGroupRepository.save(updatedMarket);
  return updatedMarket;
};

// Called when the process starts after initialization. Watches events for a given market and calls upsertEvent for each one.
export const indexMarketGroupEvents = async (
  market: MarketGroup,
  client: PublicClient
): Promise<() => void> => {
  await initializeDataSource();
  const chainId = await client.getChainId();

  try {
    await updateCollateralData(client, market);
    await marketGroupRepository.save(market);
  } catch (err) {
    console.error(
      `Failed to update collateral data for market ${market.address}:`,
      err
    );
  }

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 5000;
  let reconnectAttempts = 0;
  let currentUnwatch: (() => void) | null = null;
  let isActive = true; // To allow permanent stop

  const descriptiveName = `market ${market.address} on chain ${chainId}`;

  const processLogs = async (logs: Log[]) => {
    console.log(
      `[MarketEventWatcher] Processing ${logs.length} logs for ${descriptiveName}`
    );
    for (const log of logs) {
      try {
        const serializedLog = JSON.stringify(log, bigintReplacer);
        const blockNumber = log.blockNumber || 0n;
        const block = await client.getBlock({
          blockNumber,
        });
        const logIndex = log.logIndex || 0;
        const logData = JSON.parse(serializedLog);
        const epochId = logData.args?.epochId || 0;

        await alertEvent(chainId, market.address, logData);

        await upsertEvent(
          chainId,
          market.address,
          epochId,
          blockNumber,
          block.timestamp,
          logIndex,
          logData
        );
        // Reset reconnect attempts on successful processing of a log entry
        // Potentially, we might want to reset only if all logs in the batch are processed successfully.
        // For now, resetting on any successful log processing to mimic evmIndexer's onBlock success.
        reconnectAttempts = 0;
      } catch (error) {
        console.error(
          `[MarketEventWatcher] Error processing a log for ${descriptiveName}:`,
          error,
          log
        );
        Sentry.withScope((scope) => {
          scope.setExtra('marketAddress', market.address);
          scope.setExtra('chainId', chainId);
          scope.setExtra('log', log);
          Sentry.captureException(error);
        });
        // Decide if one failed log processing should stop the watcher or trigger reconnect for the whole watcher.
        // For now, it continues processing other logs in the batch and doesn't trigger a reconnect for the watcher itself here.
      }
    }
  };

  const startMarketWatcher = () => {
    if (!isActive) {
      console.log(
        `[MarketEventWatcher] Watcher for ${descriptiveName} is permanently stopped. Not restarting.`
      );
      return;
    }

    console.log(
      `[MarketEventWatcher] Setting up contract event watcher for ${descriptiveName}`
    );

    try {
      currentUnwatch = client.watchContractEvent({
        address: market.address as `0x${string}`,
        abi: Foil.abi, // Assuming Foil.abi is the correct ABI for market events
        onLogs: processLogs,
        onError: (error) => {
          console.error(
            `[MarketEventWatcher] Error watching ${descriptiveName}:`,
            error
          );
          Sentry.withScope((scope) => {
            scope.setExtra('marketAddress', market.address);
            scope.setExtra('chainId', chainId);
            Sentry.captureException(error);
          });

          if (currentUnwatch) {
            currentUnwatch();
            currentUnwatch = null;
          }

          if (!isActive) {
            console.log(
              `[MarketEventWatcher] Watcher for ${descriptiveName} permanently stopped during error handling.`
            );
            return;
          }

          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const delay =
              RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1); // Exponential backoff
            console.log(
              `[MarketEventWatcher] Attempting to reconnect for ${descriptiveName} (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`
            );
            setTimeout(() => {
              startMarketWatcher();
            }, delay);
          } else {
            console.error(
              `[MarketEventWatcher] Max reconnection attempts reached for ${descriptiveName}. Stopping watch.`
            );
            Sentry.captureMessage(
              `[MarketEventWatcher] Max reconnection attempts reached for ${descriptiveName}`
            );
            isActive = false; // Stop trying if max attempts reached
          }
        },
      });
      console.log(
        `[MarketEventWatcher] Watcher setup complete for ${descriptiveName}`
      );
    } catch (error) {
      console.error(
        `[MarketEventWatcher] Critical error setting up watcher for ${descriptiveName}:`,
        error
      );
      Sentry.withScope((scope) => {
        scope.setExtra('marketAddress', market.address);
        scope.setExtra('chainId', chainId);
        Sentry.captureException(error);
      });

      if (!isActive) return;

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1);
        console.log(
          `[MarketEventWatcher] Attempting to reconnect (after setup error) for ${descriptiveName} (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`
        );
        setTimeout(() => {
          startMarketWatcher();
        }, delay);
      } else {
        console.error(
          `[MarketEventWatcher] Max reconnection attempts reached after setup error for ${descriptiveName}. Stopping.`
        );
        Sentry.captureMessage(
          `[MarketEventWatcher] Max reconnection attempts reached after setup error for ${descriptiveName}`
        );
        isActive = false;
      }
    }
  };

  startMarketWatcher();

  return () => {
    console.log(
      `[MarketEventWatcher] Permanently stopping watcher for ${descriptiveName}.`
    );
    isActive = false;
    if (currentUnwatch) {
      try {
        currentUnwatch();
        console.log(
          `[MarketEventWatcher] Unwatched ${descriptiveName} successfully.`
        );
      } catch (error) {
        console.error(
          `[MarketEventWatcher] Error unwatching ${descriptiveName}:`,
          error
        );
        Sentry.withScope((scope) => {
          scope.setExtra('marketAddress', market.address);
          scope.setExtra('chainId', chainId);
          Sentry.captureException(error);
        });
      }
      currentUnwatch = null;
    }
  };
};

// Iterates over all blocks from the market's deploy block to the current block and calls upsertEvent for each one.
export const reindexMarketEvents = async (market: MarketGroup) => {
  await initializeDataSource();
  const client = getProviderForChain(market.chainId);
  const chainId = await client.getChainId();

  // Update collateral data
  await updateCollateralData(client, market);
  await marketGroupRepository.save(market);

  // Get the contract deployment time and us it as initial lookback start time
  let deploymentBlock;
  try {
    deploymentBlock = await getContractCreationBlock(client, market.address);
  } catch (err) {
    const error = err as Error;
    console.error(`Failed to get contract creation block: ${error.message}`);
    throw new Error(`Failed to get contract creation block: ${error.message}`);
  }

  // Use the later of the deployment block or the lookback start block
  const startBlock = Math.max(
    Number(market.deployTxnBlockNumber || 0),
    Number(deploymentBlock.block.number)
  );

  // Get the end block using the sooner of epoch end time and current time
  const currentTime = Math.floor(Date.now() / 1000);
  const endTime = currentTime;

  let endBlock;
  try {
    endBlock = await getBlockByTimestamp(client, endTime);
  } catch (err) {
    const error = err as Error;
    console.error(
      `Failed to get end block for timestamp ${endTime}: ${error.message}`
    );
    console.log(`Using current block as fallback`);
    try {
      const latestBlockNumber = await client.getBlockNumber();
      endBlock = await client.getBlock({ blockNumber: latestBlockNumber });
      console.log(
        `Successfully retrieved current block ${latestBlockNumber} as fallback`
      );
    } catch (fbErr) {
      const fallbackError = fbErr as Error;
      console.error(
        `Failed to get latest block as fallback: ${fallbackError.message}`
      );
      throw new Error(
        `Could not determine end block for reindexing: ${error.message}`
      );
    }
  }

  const CHUNK_SIZE = 10000; // Process 10,000 blocks at a time

  console.log(
    `Reindexing market events for market ${market.address} from block ${startBlock} to ${endBlock.number}`
  );

  // Function to process logs regardless of how they were fetched
  const processLogs = async (logs: Log[]) => {
    for (const log of logs) {
      try {
        const decodedLog = decodeEventLog({
          abi: Foil.abi,
          data: log.data,
          topics: log.topics,
        });
        const serializedLog = JSON.stringify(decodedLog, bigintReplacer);
        const logBlockNumber = log.blockNumber || 0n;
        const block = await client.getBlock({ blockNumber: logBlockNumber });
        const logIndex = log.logIndex || 0;
        const logData = {
          ...JSON.parse(serializedLog),
          transactionHash: log.transactionHash || '',
          blockHash: log.blockHash || '',
          blockNumber: logBlockNumber.toString(),
          logIndex,
          transactionIndex: log.transactionIndex || 0,
          removed: log.removed || false,
          topics: log.topics || [],
          data: log.data || '',
        };

        // Extract epochId from logData
        const eventEpochId = logData.args?.epochId || 0;

        await upsertEvent(
          chainId,
          market.address,
          eventEpochId,
          logBlockNumber,
          block.timestamp,
          logIndex,
          logData
        );
      } catch (error) {
        console.error(
          `Error processing log at block ${log.blockNumber || 'unknown'}:`,
          error
        );
      }
    }
  };

  // Process blocks in chunks to avoid RPC limitations
  let currentBlock = startBlock;
  let totalLogsProcessed = 0;

  while (currentBlock <= Number(endBlock.number ?? BigInt(currentBlock))) {
    const chunkEndBlock = Math.min(
      currentBlock + CHUNK_SIZE - 1,
      Number(endBlock.number ?? BigInt(currentBlock))
    );

    try {
      console.log(
        `Fetching logs for blocks ${currentBlock} to ${chunkEndBlock}`
      );
      const logs = await client.getLogs({
        address: market.address as `0x${string}`,
        fromBlock: BigInt(currentBlock),
        toBlock: BigInt(chunkEndBlock),
      });

      if (logs.length > 0) {
        console.log(
          `Found ${logs.length} logs in blocks ${currentBlock}-${chunkEndBlock}`
        );
        await processLogs(logs);
        totalLogsProcessed += logs.length;
      }

      // Move to the next chunk
      currentBlock = chunkEndBlock + 1;
    } catch (error) {
      console.error(
        `Error fetching logs for block range ${currentBlock}-${chunkEndBlock}:`,
        error
      );

      // If a chunk fails, fall back to processing that chunk block by block
      console.log(
        `Falling back to block-by-block indexing for range ${currentBlock}-${chunkEndBlock}`
      );
      for (
        let blockNumber = currentBlock;
        blockNumber <= chunkEndBlock;
        blockNumber++
      ) {
        try {
          const logs = await client.getLogs({
            address: market.address as `0x${string}`,
            fromBlock: BigInt(blockNumber),
            toBlock: BigInt(blockNumber),
          });

          if (logs.length > 0) {
            console.log(
              `Processing ${logs.length} logs from block ${blockNumber}`
            );
            await processLogs(logs);
            totalLogsProcessed += logs.length;
          }
        } catch (error) {
          console.error(`Error processing block ${blockNumber}:`, error);
        }
      }

      // Move to the next chunk
      currentBlock = chunkEndBlock + 1;
    }
  }

  console.log(
    `Completed indexing for market ${market.address}. Processed ${totalLogsProcessed} logs.`
  );
};

// Upserts an event into the database using the proper helper function.
const upsertEvent = async (
  chainId: number,
  marketGroupAddress: string,
  marketId: number,
  blockNumber: bigint,
  timeStamp: bigint,
  logIndex: number,
  logData: LogData
) => {
  console.log('handling event upsert:', {
    chainId,
    address: marketGroupAddress,
    epochId: marketId,
    blockNumber,
    timeStamp,
    logIndex,
    logData,
  });

  // Find marke group with relations
  const marketGroup = await marketGroupRepository.findOne({
    where: { chainId, address: marketGroupAddress.toLowerCase() },
    relations: ['marketParams'],
  });

  if (!marketGroup) {
    throw new Error(
      `Market group not found for chainId ${chainId} and address ${marketGroupAddress}. Cannot upsert event into db.`
    );
  }

  try {
    // Check if event already exists
    const existingEvent = await eventRepository.findOne({
      where: {
        transactionHash: logData.transactionHash,
        marketGroup: { id: marketGroup.id },
        blockNumber: Number(blockNumber),
        logIndex: logIndex,
      },
      relations: ['marketGroup'],
    });

    if (existingEvent) {
      console.log('Event already exists, processing existing event');
      // Update the existing event with any new data to avoid UpdateValuesMissingError
      existingEvent.timestamp = timeStamp.toString();
      existingEvent.logData = logData;
      await eventRepository.save(existingEvent);
      await upsertEntitiesFromEvent(
        existingEvent,
        marketGroupAddress,
        marketId,
        chainId
      );
      return existingEvent;
    }

    console.log('inserting new event..');
    const newEvent = new Event();
    newEvent.marketGroup = marketGroup;
    newEvent.blockNumber = Number(blockNumber);
    newEvent.timestamp = timeStamp.toString();
    newEvent.logIndex = logIndex;
    newEvent.logData = logData;
    newEvent.transactionHash = logData.transactionHash;

    const savedEvent = await eventRepository.save(newEvent);

    // Reload the event with all necessary relations
    const loadedEvent = await eventRepository.findOne({
      where: { id: savedEvent.id },
      relations: ['marketGroup'],
    });

    if (!loadedEvent) {
      throw new Error(`Failed to load saved event with ID ${savedEvent.id}`);
    }

    await upsertEntitiesFromEvent(
      loadedEvent,
      marketGroupAddress,
      marketId,
      chainId
    );
    return loadedEvent;
  } catch (error) {
    console.error('Error upserting event:', error);
    throw error;
  }
};
// Triggered by the callback in the Event model, this upserts related entities (Transaction, Position, MarketPrice).
export const upsertEntitiesFromEvent = async (
  event: Event,
  marketGroupAddress: string,
  marketId: number,
  chainId: number
) => {
  // First check if this event has already been processed by looking for an existing transaction
  const existingTransaction = await transactionRepository.findOne({
    where: { event: { id: event.id } },
  });
  if (existingTransaction) {
    if (event.logData.eventName != EventType.PositionSettled) {
      return;
    }
  }

  let skipTransaction = false;
  const newTransaction = new Transaction();
  newTransaction.event = event;

  // Process the event based on its type
  switch (event.logData.eventName) {
    // Market events
    case EventType.MarketInitialized: {
      console.log('initializing market. event: ', event);
      const marketCreatedArgs = {
        uniswapPositionManager: event.logData.args.uniswapPositionManager,
        uniswapSwapRouter: event.logData.args.uniswapSwapRouter,
        optimisticOracleV3: event.logData.args.optimisticOracleV3,
        marketParams: event.logData.args.marketParams,
      } as MarketCreatedUpdatedEventLog;
      await createOrUpdateMarketFromEvent(
        marketCreatedArgs,
        event.marketGroup.chainId,
        event.marketGroup.address,
        event.marketGroup
      );
      skipTransaction = true;
      break;
    }
    case EventType.MarketUpdated: {
      console.log('updating market. event: ', event);
      const marketUpdatedArgs = {
        uniswapPositionManager: event.logData.args.uniswapPositionManager,
        uniswapSwapRouter: event.logData.args.uniswapSwapRouter,
        optimisticOracleV3: event.logData.args.optimisticOracleV3,
        marketParams: event.logData.args.marketParams,
      } as MarketCreatedUpdatedEventLog;
      await createOrUpdateMarketFromEvent(
        marketUpdatedArgs,
        event.marketGroup.chainId,
        event.marketGroup.address,
        event.marketGroup
      );
      skipTransaction = true;
      break;
    }

    // Epoch events
    case EventType.EpochCreated: {
      console.log('creating epoch. event: ', event);
      const epochCreatedArgs = {
        epochId: event.logData.args.epochId,
        startTime: event.logData.args.startTime,
        endTime: event.logData.args.endTime,
        startingSqrtPriceX96: event.logData.args.startingSqrtPriceX96,
      } as EpochCreatedEventLog;
      await createEpochFromEvent(epochCreatedArgs, event.marketGroup);

      // Call createOrUpdateEpochFromContract with the data from the event
      await createOrUpdateEpochFromContract(
        event.marketGroup,
        Number(epochCreatedArgs.epochId)
      );
      skipTransaction = true;
      break;
    }
    case EventType.EpochSettled: {
      console.log('Market settled event. event: ', event);
      const epoch = await marketRepository.findOne({
        where: {
          marketGroup: {
            address: event.marketGroup.address.toLowerCase(),
            chainId: event.marketGroup.chainId,
          },
          marketId: Number(event.logData.args.epochId),
        },
        relations: ['marketGroup'],
      });
      if (epoch) {
        epoch.settled = true;
        const settlementSqrtPriceX96: bigint = BigInt(
          (event.logData.args.settlementSqrtPriceX96 as string)?.toString() ??
            '0'
        );
        const settlementPriceD18 = sqrtPriceX96ToSettlementPriceD18(
          settlementSqrtPriceX96
        );
        epoch.settlementPriceD18 = settlementPriceD18.toString();
        await marketRepository.save(epoch);
      } else {
        console.error('Epoch not found for market: ', event.marketGroup);
      }
      skipTransaction = true;
      break;
    }

    // Position events
    case EventType.Transfer:
      console.log('Handling Transfer event: ', event);
      await handleTransferEvent(event);
      skipTransaction = true;
      break;
    case EventType.PositionSettled:
      console.log('Handling Position Settled from event: ', event);
      settledPositions.push(event.logData.args.positionId);
      await Promise.all([
        handlePositionSettledEvent(event),
        updateTransactionFromPositionSettledEvent(
          newTransaction,
          event,
          marketGroupAddress,
          marketId,
          chainId
        ),
      ]);
      break;

    // Liquidity events
    case EventType.LiquidityPositionCreated:
      console.log('Creating liquidity position from event: ', event);
      updateTransactionFromAddLiquidityEvent(newTransaction, event);
      break;
    case EventType.LiquidityPositionClosed:
      console.log('Closing liquidity position from event: ', event);
      await updateTransactionFromLiquidityClosedEvent(newTransaction, event);
      break;
    case EventType.LiquidityPositionDecreased:
      console.log('Decreasing liquidity position from event: ', event);
      await updateTransactionFromLiquidityModifiedEvent(
        newTransaction,
        event,
        true
      );
      break;
    case EventType.LiquidityPositionIncreased:
      console.log('Increasing liquidity position from event: ', event);
      await updateTransactionFromLiquidityModifiedEvent(newTransaction, event);
      break;

    // Trader events
    case EventType.TraderPositionCreated:
      console.log('Creating trader position from event: ', event);
      await updateTransactionFromTradeModifiedEvent(newTransaction, event);
      break;
    case EventType.TraderPositionModified:
      console.log('Modifying trader position from event: ', event);
      await updateTransactionFromTradeModifiedEvent(newTransaction, event);
      break;

    default:
      skipTransaction = true;
      break;
  }

  if (!skipTransaction) {
    try {
      // Fill transaction with collateral transfer and market price

      await insertCollateralTransfer(newTransaction);
      await insertMarketPrice(newTransaction);

      // Ensure collateral is set to a default value if not present
      if (!newTransaction.collateral || newTransaction.collateral === '') {
        newTransaction.collateral = '0';
      }

      // Ensure all required fields have values to prevent UpdateValuesMissingError
      if (!newTransaction.baseToken) newTransaction.baseToken = '0';
      if (!newTransaction.quoteToken) newTransaction.quoteToken = '0';
      if (!newTransaction.borrowedBaseToken)
        newTransaction.borrowedBaseToken = '0';
      if (!newTransaction.borrowedQuoteToken)
        newTransaction.borrowedQuoteToken = '0';
      if (!newTransaction.tradeRatioD18) newTransaction.tradeRatioD18 = '0';

      // Save the transaction
      console.log('Saving new transaction: ', newTransaction);
      await transactionRepository.save(newTransaction);

      // Then create or modify the position with the saved transaction
      try {
        await createOrModifyPositionFromTransaction(newTransaction);
      } catch (positionError) {
        console.error('Error creating or modifying position:', positionError);
      }
    } catch (error) {
      console.error('Error processing event:', error);
      // If it's a duplicate key error, just log and continue
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        console.warn(
          'Duplicate key error - this event may have already been processed'
        );
        return;
      }
      throw error;
    }
  }
};

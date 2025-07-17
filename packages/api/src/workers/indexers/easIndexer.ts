import prisma from '../../db';
import { getBlockByTimestamp, getProviderForChain } from '../../utils/utils';
import { type PublicClient, parseAbiItem, getContract, decodeAbiParameters } from 'viem';
import Sentry from '../../instrument';

// EAS contract addresses on different chains
const EAS_CONTRACTS = {
  1: '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587', // Ethereum Mainnet
  11155111: '0xC2679fBD37d54388Ce493F1DB75320D236e1815e', // Sepolia
  10: '0x4200000000000000000000000000000000000021', // Optimism
  8453: '0x4200000000000000000000000000000000000021', // Base
  42161: '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458', // Arbitrum
} as const;

// Your specific prediction market schema
const PREDICTION_MARKET_SCHEMA_ID = '0x70c5a48f8bf98f877e109501da138243aec847479a69c09390ab468f0b349fc4';

// Schema for decoding prediction market data: address marketAddress, uint256 marketId, uint160 prediction, string comment
const PREDICTION_MARKET_SCHEMA = [
  { type: 'address', name: 'marketAddress' },
  { type: 'uint256', name: 'marketId' },
  { type: 'uint160', name: 'prediction' },
  { type: 'string', name: 'comment' }
] as const;

// EAS ABI for attestation events and data fetching
const EAS_ABI = [
  parseAbiItem('event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)'),
  parseAbiItem('function getAttestation(bytes32 uid) external view returns (tuple(bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))'),
] as const;

interface AttestationData {
  uid: string;
  schema: string;
  time: bigint;
  recipient: string;
  attester: string;
  data: string;
}

interface PredictionMarketEvent {
  uid: string;
  schemaUID: string;
  attester: string;
  recipient: string;
  transactionHash: string;
  blockNumber: bigint;
  timestamp: number;
}

interface DecodedPredictionData {
  marketAddress: string;
  marketId: string;
  prediction: string;
  comment: string;
}

export class EASPredictionIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private chainId: number;
  private easContract: any;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);
    
    const easAddress = EAS_CONTRACTS[chainId as keyof typeof EAS_CONTRACTS];
    if (!easAddress) {
      throw new Error(`EAS contract not available for chain ${chainId}`);
    }

    this.easContract = getContract({
      address: easAddress as `0x${string}`,
      abi: EAS_ABI,
      client: this.client,
    });
  }

  private async getAttestationData(uid: string): Promise<AttestationData | null> {
    try {
      const result = await this.easContract.read.getAttestation([uid as `0x${string}`]);
      
      return {
        uid: result.uid,
        schema: result.schema,
        time: result.time,
        recipient: result.recipient,
        attester: result.attester,
        data: result.data,
      };
    } catch (error) {
      console.error(`[EASPredictionIndexer] Error fetching attestation data for ${uid}:`, error);
      return null;
    }
  }

  private decodePredictionMarketData(rawData: string): DecodedPredictionData | null {
    try {
      if (!rawData || rawData === '0x') {
        return null;
      }

      const decoded = decodeAbiParameters(PREDICTION_MARKET_SCHEMA, rawData as `0x${string}`);
      
      return {
        marketAddress: decoded[0].toString(),
        marketId: decoded[1].toString(),
        prediction: decoded[2].toString(),
        comment: decoded[3].toString(),
      };
    } catch (error) {
      console.error('[EASPredictionIndexer] Error decoding prediction market data:', error);
      return null;
    }
  }

  private async getPredictionMarketEventsFromBlock(blockNumber: bigint): Promise<PredictionMarketEvent[]> {
    try {
      // Only get events for the prediction market schema
      const attestedLogs = await this.client.getLogs({
        address: EAS_CONTRACTS[this.chainId as keyof typeof EAS_CONTRACTS] as `0x${string}`,
        event: parseAbiItem('event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)'),
        args: {
          schemaUID: PREDICTION_MARKET_SCHEMA_ID as `0x${string}`,
        },
        fromBlock: blockNumber,
        toBlock: blockNumber,
      });

      const events: PredictionMarketEvent[] = [];
      const block = await this.client.getBlock({ blockNumber });

      for (const log of attestedLogs) {
        events.push({
          uid: log.args.uid!,
          schemaUID: log.args.schemaUID!,
          attester: log.args.attester!,
          recipient: log.args.recipient!,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber!,
          timestamp: Number(block.timestamp),
        });
      }

      return events;
    } catch (error) {
      console.error(`[EASPredictionIndexer] Error fetching prediction market events from block ${blockNumber}:`, error);
      return [];
    }
  }

  private async storePredictionAttestation(event: PredictionMarketEvent): Promise<void> {
    try {
      // Get full attestation data to decode the prediction
      const attestationData = await this.getAttestationData(event.uid);
      if (!attestationData) {
        console.warn(`[EASPredictionIndexer] Could not fetch attestation data for ${event.uid}`);
        return;
      }

      // Decode the prediction market data
      const decodedData = this.decodePredictionMarketData(attestationData.data);
      if (!decodedData) {
        console.warn(`[EASPredictionIndexer] Could not decode prediction data for ${event.uid}`);
        return;
      }

      await prisma.predictionAttestation.upsert({
        where: {
          uid: event.uid,
        },
        create: {
          uid: event.uid,
          attester: event.attester,
          recipient: event.recipient,
          timestamp: event.timestamp,
          blockNumber: Number(event.blockNumber),
          transactionHash: event.transactionHash,
          marketAddress: decodedData.marketAddress,
          marketId: decodedData.marketId,
          prediction: decodedData.prediction,
          comment: decodedData.comment || null,
        },
        update: {
          // In case we reprocess, update the decoded data
          marketAddress: decodedData.marketAddress,
          marketId: decodedData.marketId,
          prediction: decodedData.prediction,
          comment: decodedData.comment || null,
        },
      });

      console.log(`[EASPredictionIndexer] Stored prediction attestation ${event.uid} for market ${decodedData.marketAddress} with prediction ${decodedData.prediction}`);
    } catch (error) {
      console.error(`[EASPredictionIndexer] Error storing prediction attestation:`, error);
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('event', event);
        scope.setExtra('chainId', this.chainId);
        Sentry.captureException(error);
      });
    }
  }

  async indexBlocksFromTimestamp(
    startTimestamp: number,
    endTimestamp?: number,
    overwriteExisting: boolean = false
  ): Promise<boolean> {
    try {
      const initialBlock = await getBlockByTimestamp(this.client, startTimestamp);
      if (!initialBlock.number) {
        throw new Error('No block found at timestamp');
      }

      let endBlock;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
        if (!endBlock.number) {
          throw new Error('No block found at end timestamp');
        }
      } else {
        endBlock = await this.client.getBlock();
      }

      if (!endBlock.number) {
        throw new Error('No end block number found');
      }

      console.log(`[EASPredictionIndexer] Indexing prediction market attestations from block ${initialBlock.number} to ${endBlock.number}`);

      // Process blocks in batches
      const batchSize = 100;
      for (let i = Number(initialBlock.number); i <= Number(endBlock.number); i += batchSize) {
        const batchEnd = Math.min(i + batchSize - 1, Number(endBlock.number));
        
        console.log(`[EASPredictionIndexer] Processing batch: blocks ${i} to ${batchEnd}`);

        for (let blockNumber = i; blockNumber <= batchEnd; blockNumber++) {
          try {
            // Check if we already have data for this block
            if (!overwriteExisting) {
              const existingAttestations = await prisma.predictionAttestation.findFirst({
                where: {
                  blockNumber: blockNumber,
                },
              });

              if (existingAttestations) {
                console.log(`[EASPredictionIndexer] Already have data for block ${blockNumber}, skipping...`);
                continue;
              }
            }

            const events = await this.getPredictionMarketEventsFromBlock(BigInt(blockNumber));
            
            if (events.length > 0) {
              console.log(`[EASPredictionIndexer] Found ${events.length} prediction market attestations in block ${blockNumber}`);
              
              for (const event of events) {
                await this.storePredictionAttestation(event);
              }
            }
          } catch (error) {
            console.error(`[EASPredictionIndexer] Error processing block ${blockNumber}:`, error);
            Sentry.withScope((scope: Sentry.Scope) => {
              scope.setExtra('blockNumber', blockNumber);
              scope.setExtra('chainId', this.chainId);
              Sentry.captureException(error);
            });
          }
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return true;
    } catch (error) {
      console.error(`[EASPredictionIndexer] Error in indexBlocksFromTimestamp:`, error);
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('startTimestamp', startTimestamp);
        scope.setExtra('endTimestamp', endTimestamp);
        scope.setExtra('chainId', this.chainId);
        Sentry.captureException(error);
      });
      return false;
    }
  }

  async indexSpecificBlocks(blocks: number[]): Promise<boolean> {
    try {
      console.log(`[EASPredictionIndexer] Indexing ${blocks.length} specific blocks`);

      for (const blockNumber of blocks) {
        try {
          const events = await this.getPredictionMarketEventsFromBlock(BigInt(blockNumber));
          
          if (events.length > 0) {
            console.log(`[EASPredictionIndexer] Found ${events.length} prediction market attestations in block ${blockNumber}`);
            
            for (const event of events) {
              await this.storePredictionAttestation(event);
            }
          }
        } catch (error) {
          console.error(`[EASPredictionIndexer] Error processing block ${blockNumber}:`, error);
          Sentry.withScope((scope: Sentry.Scope) => {
            scope.setExtra('blockNumber', blockNumber);
            scope.setExtra('chainId', this.chainId);
            Sentry.captureException(error);
          });
        }
      }

      return true;
    } catch (error) {
      console.error(`[EASPredictionIndexer] Error in indexSpecificBlocks:`, error);
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('blocks', blocks);
        scope.setExtra('chainId', this.chainId);
        Sentry.captureException(error);
      });
      return false;
    }
  }

  async watchForNewPredictions(): Promise<void> {
    if (this.isWatching) {
      console.log(`[EASPredictionIndexer] Already watching for new predictions`);
      return;
    }

    this.isWatching = true;
    console.log(`[EASPredictionIndexer] Starting to watch for new prediction market attestations on chain ${this.chainId}`);

    try {
      const unwatch = this.client.watchEvent({
        address: EAS_CONTRACTS[this.chainId as keyof typeof EAS_CONTRACTS] as `0x${string}`,
        event: parseAbiItem('event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)'),
        args: {
          schemaUID: PREDICTION_MARKET_SCHEMA_ID as `0x${string}`,
        },
        onLogs: async (logs) => {
          for (const log of logs) {
            try {
              const block = await this.client.getBlock({ blockNumber: log.blockNumber! });

              const event: PredictionMarketEvent = {
                uid: log.args.uid!,
                schemaUID: log.args.schemaUID!,
                attester: log.args.attester!,
                recipient: log.args.recipient!,
                transactionHash: log.transactionHash,
                blockNumber: log.blockNumber!,
                timestamp: Number(block.timestamp),
              };

              await this.storePredictionAttestation(event);
              console.log(`[EASPredictionIndexer] Processed new prediction: ${event.uid}`);
            } catch (error) {
              console.error(`[EASPredictionIndexer] Error processing prediction event:`, error);
            }
          }
        },
        onError: (error) => {
          console.error(`[EASPredictionIndexer] Error in prediction watcher:`, error);
        },
      });

      // Store unwatch function for cleanup
      process.on('SIGINT', () => {
        unwatch();
        this.isWatching = false;
      });

    } catch (error) {
      console.error(`[EASPredictionIndexer] Error setting up watcher:`, error);
      this.isWatching = false;
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('chainId', this.chainId);
        Sentry.captureException(error);
      });
    }
  }

  // Query methods for your predictions
  async getPredictionsByMarket(marketAddress: string, marketId?: string) {
    const where: any = { marketAddress };
    if (marketId) {
      where.marketId = marketId;
    }

    return await prisma.predictionAttestation.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    });
  }

  async getPredictionsByAttester(attester: string) {
    return await prisma.predictionAttestation.findMany({
      where: { attester },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getRecentPredictions(limit: number = 100) {
    return await prisma.predictionAttestation.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }
}

export default EASPredictionIndexer; 

import type { Abi, PublicClient } from 'viem';
import type { Resource } from '../generated/prisma';

export enum EventType {
  LiquidityPositionCreated = 'LiquidityPositionCreated',
  LiquidityPositionIncreased = 'LiquidityPositionIncreased',
  LiquidityPositionDecreased = 'LiquidityPositionDecreased',
  LiquidityPositionClosed = 'LiquidityPositionClosed',
  TraderPositionCreated = 'TraderPositionCreated',
  TraderPositionModified = 'TraderPositionModified',
  Transfer = 'Transfer',
  MarketGroupInitialized = 'MarketGroupInitialized',
  MarketGroupUpdated = 'MarketGroupUpdated',
  PositionSettled = 'PositionSettled',
  MarketCreated = 'MarketCreated',
  MarketSettled = 'MarketSettled',
  // PositionUpdated = 'PositionUpdated',
}

export interface TradePositionEventLog {
  marketId: string;
  positionId: string;
  collateralAmount: string;
  vQuoteAmount: string;
  vBaseAmount: string;
  borrowedVQuote: string;
  borrowedVBase: string;
  initialPrice: string;
  finalPrice: string;
  tradeRatio: string;
}

export interface LiquidityPositionCreatedEventLog {
  positionId: string;
  collateralAmount: string;
  addedAmount0: string;
  addedAmount1: string;
  liquidity: string;
  lowerTick: number;
  upperTick: number;
}

export interface LiquidityPositionModifiedEventLog {
  positionId: string;
  collateralAmount: string;
  loanAmount0: string;
  loanAmount1: string;
  liquidity: string;
}

export interface LiquidityPositionClosedEventLog {
  positionId: string;
  kind: PositionKind;
  collectedAmount0: string;
  collectedAmount1: string;
}

export interface PositionSettledEventLog {
  positionId: string;
  withdrawableCollateral: string;
}

export enum PositionKind {
  Unknown,
  Liquidity,
  Trade,
}

export interface MarketParams {
  assertionLiveness: bigint;
  bondAmount: bigint;
  bondCurrency: string;
  feeRate: number;
  optimisticOracleV3: string;
  uniswapPositionManager: string;
  uniswapQuoter: string;
  uniswapSwapRouter: string;
}

export interface MarketData {
  marketId: string;
  startTime: bigint;
  endTime: bigint;
  pool: `0x${string}`;
  quoteToken: string;
  baseToken: string;
  minPriceD18: bigint;
  maxPriceD18: bigint;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  settled: boolean;
  settlementPriceD18: bigint;
  claimStatementYesOrNumeric: string;
  claimStatementNo: string;
}

export interface MarketGroupCreatedUpdatedEventLog {
  initialOwner?: string;
  collateralAsset?: string;
  feeCollectorNFT?: string;
  minTradeSize?: string;
  isBridged?: boolean;
  marketParams: MarketParams;
}

export interface MarketCreatedEventLog {
  marketId: string;
  startTime: string;
  endTime: string;
  startingSqrtPriceX96: string;
  claimStatementYesOrNumeric: string;
  claimStatementNo: string;
}

export interface Deployment {
  address: string;
  abi: Abi;
  deployTimestamp: string;
  deployTxnBlockNumber: string;
}
export enum TimeWindow {
  D = '1D',
  W = '1W',
  M = '1M',
}

export enum EventTransactionType {
  Undefined,
  CreateLiquidityPosition,
  IncreaseLiquidityPosition,
  DecreaseLiquidityPosition,
  CloseLiquidityPosition,
  TransitionLiquidityToTrade,
  DepositCollateral,
  CreateTradePosition,
  ModifyTradePosition,
  CloseTradePosition,
}

export interface PositionUpdatedEventLog {
  sender: string;
  marketId: string;
  positionId: string;
  transactionType: EventTransactionType;
  deltaCollateral: string;
  collateralAmount: string;
  vQuoteAmount: string;
  vBaseAmount: string;
  borrowedVQuote: string;
  borrowedVBase: string;
}
export interface IResourcePriceIndexer {
  client?: PublicClient;
  indexBlockPriceFromTimestamp(
    resource: Resource,
    startTimestamp: number,
    endTimestamp?: number,
    overwriteExisting?: boolean
  ): Promise<boolean>;
  indexBlocks(resource: Resource, blocks: number[]): Promise<boolean>;
  watchBlocksForResource(resource: Resource): Promise<void>;
}

export interface LogData {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  data: string;
  logIndex: number;
  removed: boolean;
  topics: string[];
  transactionIndex: number;
}

export interface marketInfo {
  marketChainId: number;
  deployment: {
    address: string;
    deployTxnBlockNumber?: string | number | null;
    deployTimestamp?: string | number | null;
  };
  resource: {
    id?: number | string;
    slug?: string;
    priceIndexer: {
      client?: PublicClient;
      indexBlocks: (
        resource: Resource,
        blockNumbers: number[]
      ) => Promise<boolean>;
    } | null;
    [key: string]: unknown;
  };

  isCumulative?: boolean;
  isBridged?: boolean;
}

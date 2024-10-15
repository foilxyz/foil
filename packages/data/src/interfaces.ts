import { Abi } from "viem";
import EvmIndexer from "./resourcePriceFunctions/evmIndexer";

export enum EventType {
  LiquidityPositionCreated = "LiquidityPositionCreated",
  LiquidityPositionIncreased = "LiquidityPositionIncreased",
  LiquidityPositionDecreased = "LiquidityPositionDecreased",
  LiquidityPositionClosed = "LiquidityPositionClosed",
  TraderPositionCreated = "TraderPositionCreated",
  TraderPositionModified = "TraderPositionModified",
  Transfer = "Transfer",
  MarketInitialized = "MarketInitialized",
  MarketUpdated = "MarketUpdated",
  EpochCreated = "EpochCreated",
  EpochSettled = "EpochSettled",
}

export interface TradePositionEventLog {
  epochId: string;
  positionId: string;
  collateralAmount: string;
  vEthAmount: string;
  vGasAmount: string;
  borrowedVEth: string;
  borrowedVGas: string;
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

export enum PositionKind {
  Unknown,
  Liquidity,
  Trade,
}

export interface EpochParams {
  assertionLiveness: bigint;
  baseAssetMaxPriceTick: number;
  baseAssetMinPriceTick: number;
  bondAmount: bigint;
  bondCurrency: string;
  feeRate: number;
  optimisticOracleV3: string;
  priceUnit: string;
  uniswapPositionManager: string;
  uniswapQuoter: string;
  uniswapSwapRouter: string;
}

export interface MarketCreatedUpdatedEventLog {
  owner: string;
  uniswapPositionManager: string;
  collateralAsset?: string;
  uniswapSwapRouter: string;
  optimisticOracleV3: string;
  epochParams: EpochParams;
}

export interface EpochCreatedEventLog {
  epochId: string;
  startTime: string;
  endTime: string;
  startingSqrtPriceX96: string;
}

export interface Deployment {
  address: string;
  abi: Abi;
  deployTimestamp: string;
  deployTxnBlockNumber: string;
}
export enum TimeWindow {
  H = "1H",
  D = "1D",
  W = "1W",
  M = "1M",
  Y = "1Y",
}

export interface MarketInfo {
  name: string;
  public: boolean;
  deployment: Deployment;
  marketChainId: number;
  priceIndexer: EvmIndexer;
}

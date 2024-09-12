export enum PositionKind {
  Unknown,
  Liquidity,
  Trade,
}
export interface FoilPosition {
  id: bigint; // nft id
  kind: PositionKind;
  epochId: bigint;
  // Accounting data (debt and deposited collateral)
  depositedCollateralAmount: bigint; // configured collateral
  borrowedVEth: bigint;
  borrowedVGas: bigint;
  // Position data (owned tokens and position size)
  vEthAmount: bigint;
  vGasAmount: bigint;
  // currentTokenAmount: bigint;
}

export enum TransactionType {
  ADD_LIQUIDITY = 'addLiquidity',
  REMOVE_LIQUIDITY = 'removeLiquidity',
  LONG = 'long',
  SHORT = 'short',
}

// TODO: Share this interface with data package in monorepo
export interface EpochParams {
  assertionLiveness: bigint;
  baseAssetMaxPriceTick: number;
  baseAssetMinPriceTick: number;
  bondAmount: bigint;
  bondCurrency: string;
  feeRate: number;
  optimisticOracleV3: string;
  priceUnit: string;
  uniswapPositionManager: `0x${string}`;
  uniswapQuoter: `0x${string}`;
  uniswapSwapRouter: `0x${string}`;
}

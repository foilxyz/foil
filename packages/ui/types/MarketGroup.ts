export type MarketsApiResponse = Array<{
  id: number;
  name: string;
  chainId: number;
  address: string;
  collateralAsset: string;
  owner: string;
  isCumulative: boolean;
  resource: {
    id: number;
    name: string;
    slug: string;
  };
  markets: Array<{
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
  }>;
  currentMarket: {
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
  } | null;
  nextMarket: {
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
  } | null;
}>;

export interface MarketGroup {
  id: number;
  name: string;
  chainId: number;
  address: string;
  collateralAsset: string;
  owner: string;
  isCumulative: boolean;
  resource: {
    id: number;
    name: string;
    slug: string;
  };
  markets: {
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
  }[];
}

export type MarketGroupParams = {
  assertionLiveness: bigint;
  bondAmount: bigint;
  bondCurrency: string;
  feeRate: number;
  optimisticOracleV3: string;
  claimStatement: string;
  uniswapPositionManager: `0x${string}`;
  uniswapQuoter: `0x${string}`;
  uniswapSwapRouter: `0x${string}`;
};

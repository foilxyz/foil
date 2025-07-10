// import { useToast } from '@/hooks/use-toast';
// import { useSapienceAbi } from '@/hooks/useSapienceAbi';
// import { useUniswapPool } from '@/hooks/useUniswapPool';
// import { foilApi } from '@/lib';
// import { Market } from '@/types/Market';
// import { MarketGroupParams, MarketsApiResponse } from '@/types/MarketGroup';
// import { useQuery } from '@tanstack/react-query';
// import { createContext, ReactNode, useContext, useEffect } from 'react';
// import { useReadContract } from 'wagmi';

// interface MarketGroupProviderProps {
//   chainId: number;
//   address: `0x${string}`;
//   marketId?: number;
//   children: ReactNode;
// }

// type MarketGroupContextType = {
//   question: string;
//   owner: string;
//   collateralAsset: {
//     ticker: string;
//     decimals: number;
//   };
//   marketGroupParams: MarketGroupParams;
//   market: Market;
//   isLoading: boolean;
// };

// export const MarketGroupContext = createContext<MarketGroupContextType>({
//   question: '',
//   owner: '',
//   collateralAsset: {
//     ticker: '',
//     decimals: 0,
//   },
//   marketGroupParams: {
//     assertionLiveness: BigInt(0),
//     bondAmount: BigInt(0),
//     bondCurrency: '',
//     feeRate: 0,
//     optimisticOracleV3: '',
//     claimStatement: '',
//     uniswapPositionManager: '0x' as `0x${string}`,
//     uniswapQuoter: '0x' as `0x${string}`,
//     uniswapSwapRouter: '0x' as `0x${string}`,
//   },
//   market: {
//     marketId: '',
//     startTime: BigInt(0),
//     endTime: BigInt(0),
//     poolAddress: '0x' as `0x${string}`,
//     quoteToken: '',
//     baseToken: '',
//     minPriceD18: BigInt(0),
//     maxPriceD18: BigInt(0),
//     baseAssetMinPriceTick: 0,
//     baseAssetMaxPriceTick: 0,
//     settled: false,
//     settlementPriceD18: BigInt(0),
//     pool: {} as any,
//     liquidity: '',
//   },
//   isLoading: true,
// });

// export const useMarketGroup = () => {
//   const context = useContext(MarketGroupContext);
//   if (context === undefined) {
//     throw new Error('useMarketGroup must be used within a MarketGroupProvider');
//   }
//   return context;
// };

// export const MarketGroupProvider = ({
//   chainId,
//   address,
//   marketId,
//   children,
// }: MarketGroupProviderProps) => {
//   const { toast } = useToast();
//   const { abi } = useSapienceAbi();
//   // TODO: Fetch single market
//   const {
//     data: marketGroup,
//     isLoading,
//     error,
//   } = useQuery<MarketsApiResponse[0] | undefined, Error>({
//     queryKey: ['markets'],
//     queryFn: async () => {
//       const data: MarketsApiResponse = await foilApi.get('/markets');
//       return data.find(
//         (marketGroup: MarketsApiResponse[0]) =>
//           marketGroup.address.toLowerCase() === address.toLowerCase()
//       );
//     },
//   });

//   const {
//     data: marketGroupData,
//     isLoading: isLoadingMarketGroup,
//     error: marketGroupError,
//   } = useReadContract({
//     chainId,
//     abi,
//     address,
//     functionName: 'getMarketGroup',
//   });

//   const {
//     data: marketData,
//     isLoading: isLoadingMarket,
//     error: marketError,
//   } = useReadContract({
//     chainId,
//     abi,
//     address,
//     functionName: 'getMarket',
//     args: [marketId ?? 0],
//     query: { enabled: marketId !== undefined },
//   });

//   const {
//     data: collateralTicker,
//     isLoading: isLoadingCollateralTicker,
//     error: collateralTickerError,
//   } = useReadContract({
//     chainId,
//     abi,
//     address: marketGroupData?.[1] as `0x${string}`,
//     functionName: 'symbol',
//     query: { enabled: !!marketGroupData?.[1] },
//   });

//   const {
//     data: collateralDecimals,
//     isLoading: isLoadingCollateralDecimals,
//     error: collateralDecimalsError,
//   } = useReadContract({
//     chainId,
//     abi,
//     address: marketGroupData?.[1] as `0x${string}`,
//     functionName: 'decimals',
//     query: { enabled: !!marketGroupData?.[1] },
//   });

//   const { pool, liquidity, refetchUniswapData } = useUniswapPool(
//     chainId,
//     marketData?.[0]?.pool
//   );

//   useEffect(() => {
//     if (error) {
//       toast({
//         variant: 'destructive',
//         title: 'Error',
//         description: error.message || 'Failed to fetch market data',
//       });
//     } else if (marketError) {
//       toast({
//         variant: 'destructive',
//         title: 'Error',
//         description: marketError.message || 'Failed to get market data',
//       });
//     } else if (marketError) {
//       toast({
//         variant: 'destructive',
//         title: 'Error',
//         description: marketError.message || 'Failed to get market data',
//       });
//     } else if (collateralTickerError) {
//       toast({
//         variant: 'destructive',
//         title: 'Error',
//         description:
//           collateralTickerError.message || 'Failed to get collateral ticker',
//       });
//     } else if (collateralDecimalsError) {
//       toast({
//         variant: 'destructive',
//         title: 'Error',
//         description:
//           collateralDecimalsError.message ||
//           'Failed to get collateral decimals',
//       });
//     }
//   }, [
//     error,
//     marketError,
//     marketError,
//     collateralTickerError,
//     collateralDecimalsError,
//     toast,
//   ]);

//   // Create market object from the fetched data
//   const market: Market = {
//     marketId: marketData?.[0]?.id?.toString() || '',
//     startTime: marketData?.[0]?.startTime || BigInt(0),
//     endTime: marketData?.[0]?.endTime || BigInt(0),
//     poolAddress: (marketData?.[0]?.pool || '0x') as `0x${string}`,
//     quoteToken: marketData?.[1]?.token0 || '',
//     baseToken: marketData?.[1]?.token1 || '',
//     minPriceD18: marketData?.[0]?.minPriceD18 || BigInt(0),
//     maxPriceD18: marketData?.[0]?.maxPriceD18 || BigInt(0),
//     baseAssetMinPriceTick: Number(marketData?.[0]?.baseAssetMinPriceTick || 0),
//     baseAssetMaxPriceTick: Number(marketData?.[0]?.baseAssetMaxPriceTick || 0),
//     settled: marketData?.[0]?.settled || false,
//     settlementPriceD18: marketData?.[0]?.settlementPriceD18 || BigInt(0),
//     pool: pool || ({} as any),
//     liquidity: liquidity || '',
//   };

//   // Create marketGroupParams from the fetched data
//   const marketGroupParams: MarketGroupParams = {
//     assertionLiveness: marketGroupData?.[0]?.assertionLiveness || BigInt(0),
//     bondAmount: marketGroupData?.[0]?.bondAmount || BigInt(0),
//     bondCurrency: marketGroupData?.[0]?.bondCurrency || '',
//     feeRate: Number(marketGroupData?.[0]?.feeRate || 0),
//     optimisticOracleV3: marketGroupData?.[0]?.optimisticOracleV3 || '',
//     claimStatement: marketGroupData?.[0]?.claimStatement || '',
//     uniswapPositionManager: (marketGroupData?.[0]?.uniswapPositionManager ||
//       '0x') as `0x${string}`,
//     uniswapQuoter: (marketGroupData?.[0]?.uniswapQuoter || '0x') as `0x${string}`,
//     uniswapSwapRouter: (marketGroupData?.[0]?.uniswapSwapRouter ||
//       '0x') as `0x${string}`,
//   };

//   // Combine all loading states
//   const isLoadingAll =
//     isLoading ||
//     isLoadingMarketGroup ||
//     isLoadingMarket ||
//     isLoadingCollateralTicker ||
//     isLoadingCollateralDecimals;

//   const contextValue = {
//     question: marketGroup?.currentMarket?.question || '',
//     owner: marketGroup?.owner || '',
//     collateralAsset: {
//       ticker: Array.isArray(collateralTicker)
//         ? collateralTicker[0] || ''
//         : collateralTicker || '',
//       decimals: Number(collateralDecimals || 0),
//     },
//     marketGroupParams,
//     market,
//     isLoading: isLoadingAll,
//   };

//   return (
//     <MarketGroupContext.Provider value={contextValue}>
//       {children}
//     </MarketGroupContext.Provider>
//   );
// };

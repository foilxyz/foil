import type { Address } from 'viem';
import { useReadContract } from 'wagmi';

// ABI for the MarketLayerZeroBridge contract
const MARKET_LAYER_ZERO_BRIDGE_ABI = [
  {
    type: 'function',
    name: 'isMarketGroupEnabled',
    inputs: [
      {
        name: 'marketGroup',
        type: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
  },
] as const;

export const useMarketGroupBridgeStatus = (
  marketGroupAddress: Address | undefined,
  bridgeAddress: Address | undefined
) => {
  const {
    data: isEnabled,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    address: bridgeAddress,
    abi: MARKET_LAYER_ZERO_BRIDGE_ABI,
    functionName: 'isMarketGroupEnabled',
    args: marketGroupAddress ? [marketGroupAddress] : undefined,
    query: {
      enabled: !!marketGroupAddress && !!bridgeAddress,
    },
  });

  return {
    isEnabled: isEnabled ?? false,
    isLoading,
    error,
    refetch,
  };
};

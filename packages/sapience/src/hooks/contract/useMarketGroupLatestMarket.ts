import { useSapienceAbi } from '@sapience/ui/hooks/useSapienceAbi';
import type { Address, Abi } from 'viem';
import { useReadContract } from 'wagmi';

/**
 * Hook to fetch the latest market ID for a specific market group contract.
 *
 * @param marketGroupAddress The address of the deployed market group contract.
 * @param chainId The chain ID where the contract is deployed.
 * @returns An object containing the latest market ID, loading state, and error state.
 */
export const useMarketGroupLatestMarket = (
  marketGroupAddress?: Address,
  chainId?: number
) => {
  const { abi } = useSapienceAbi();

  const {
    data: latestMarketData,
    error: readError,
    isLoading: isReadingMarket,
    refetch: refetchLatestMarket, // Expose refetch if needed
  } = useReadContract({
    address: marketGroupAddress,
    abi: abi as Abi, // Cast ABI to Viem's Abi type
    functionName: 'getLatestMarket',
    chainId,
  });

  // Extract the marketId from the returned tuple
  const latestMarketId =
    latestMarketData &&
    Array.isArray(latestMarketData) &&
    latestMarketData.length > 0 &&
    typeof latestMarketData[0] === 'object' &&
    latestMarketData[0] !== null &&
    'marketId' in latestMarketData[0]
      ? (latestMarketData[0] as { marketId: bigint }).marketId // Type assertion after checks
      : undefined;

  return {
    latestMarketId, // bigint | undefined
    isLoading: isReadingMarket,
    error: readError,
    refetch: refetchLatestMarket, // Optionally return refetch function
  };
};

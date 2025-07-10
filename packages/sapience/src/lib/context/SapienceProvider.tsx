'use client';

import { useToast } from '@sapience/ui/hooks/use-toast';
import { graphqlRequest } from '@sapience/ui/lib';
import type {
  QueryObserverResult,
  RefetchOptions,
} from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import { foilApi, gweiToEther, mainnetClient } from '../utils/util';

// Helper function to get a cookie by name
const getCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') {
    return undefined; // Return undefined on the server side
  }
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
  return undefined;
};
// import InstallDialog from '~/components/InstallDialog';

// Define the type based on the API response
interface PermitResponse {
  permitted: boolean;
}

// Define the interface for a single Market based on GraphQL response
export interface ApiMarket {
  id: number;
  marketId: number;
  startTimestamp: number;
  endTimestamp: number;
  public: boolean;
  question?: string;
  startingSqrtPriceX96: string; // Added
  baseAssetMinPriceTick: number; // Added
  baseAssetMaxPriceTick: number; // Added
  poolAddress?: string | null; // Added
  claimStatementYesOrNumeric?: string | null; // Added
  claimStatementNo?: string | null; // Added
  settled?: boolean | null;
  optionName?: string | null;
}

export interface MarketGroup {
  id: number;
  name: string;
  chainId: number;
  address: string;
  collateralAsset: string;
  baseTokenName?: string;
  owner: string;
  isCumulative: boolean;
  resource: {
    id: number;
    name: string;
    slug: string;
  };
  market: ApiMarket | null; // Use the new Market interface
  nextMarket: ApiMarket | null; // Use the new Market interface
  question?: string; // Added group-level question
}

interface SapienceContextType {
  // Permit data
  permitData: PermitResponse | undefined;
  isPermitLoading: boolean;
  permitError: Error | null;
  refetchPermitData: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<PermitResponse, Error>>;

  // Market data
  marketGroups: MarketGroup[];
  isMarketsLoading: boolean;
  marketsError: Error | null;
  refetchMarketGroup: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<MarketGroup[], Error>>;
  stEthPerToken: number | undefined;
}

const SapienceContext = createContext<SapienceContextType | undefined>(
  undefined
);

// Define GraphQL query for market groups
const MARKET_GROUPS_QUERY = `
  query GetMarketGroups {
    marketGroups {
      id
      chainId
      address
      question
      baseTokenName
      quoteTokenName
      market {
        id
        marketId
        question
        startTimestamp
        endTimestamp
        settled
        optionName
        startingSqrtPriceX96
        baseAssetMinPriceTick
        baseAssetMaxPriceTick
        poolAddress
        marketParamsClaimstatementYesOrNumeric
        marketParamsClaimstatementNo
      }
    }
  }
`;

// Define response types based on MARKET_GROUPS_QUERY
interface ApiMarketResponse {
  id: number;
  marketId: number;
  question?: string;
  startTimestamp: number;
  endTimestamp: number;
  settled?: boolean | null;
  optionName?: string | null;
  startingSqrtPriceX96: string;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  poolAddress?: string | null;
  marketParamsClaimstatementYesOrNumeric?: string | null;
  marketParamsClaimstatementNo?: string | null;
}

interface ApiMarketGroupResponse {
  id: number;
  chainId: number;
  address: string;
  question?: string;
  baseTokenName?: string;
  quoteTokenName?: string;
  market: ApiMarketResponse;
}

// Type definition for GraphQL response
type MarketGroupsQueryResponse = {
  marketGroups: ApiMarketGroupResponse[];
};

export const SapienceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [stEthPerToken, setStEthPerToken] = useState<number | undefined>();
  const { toast } = useToast();
  // const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);

  // Check for the permitted cookie
  const hasPermittedCookie = getCookie('permitted') === 'true';

  // Fetch permit data
  const {
    data: permitData,
    isLoading: isPermitLoading,
    error: permitError,
    refetch: refetchPermitData,
  } = useQuery<PermitResponse, Error>({
    queryKey: ['permit'],
    queryFn: async (): Promise<PermitResponse> => {
      // Explicitly type the response from fetch
      const response = await fetch(`${foilApi.baseUrl}/permit`, {
        headers: foilApi.getHeaders(),
      });

      if (!response.ok) {
        // You might want to handle the error more gracefully
        const errorBody = await response.text();
        console.error('Permit API request failed:', response.status, errorBody);
        throw new Error(`Permit request failed: ${response.status}`);
      }

      const data: PermitResponse = await response.json();

      // Set cookie if permitted
      if (data.permitted && typeof document !== 'undefined') {
        document.cookie = 'permitted=true; path=/; max-age=31536000'; // Expires in 1 year
      }
      return data; // Return the typed data
    },
    // Only fetch if the cookie is not set or not true
    enabled: !hasPermittedCookie,
    // Set initial data if the cookie is true
    initialData: hasPermittedCookie ? { permitted: true } : undefined,
  });

  // Fetch market groups
  const {
    data: marketGroups,
    isLoading: isMarketsLoading,
    error: marketsError,
    refetch: refetchMarketGroup,
  } = useQuery<MarketGroup[], Error>({
    queryKey: ['marketGroups'],
    queryFn: async () => {
      try {
        const data =
          await graphqlRequest<MarketGroupsQueryResponse>(MARKET_GROUPS_QUERY);

        // Use renamed variable and check response.data existence
        if (!data || !data.marketGroups) {
          console.error('No marketGroups data in response:', data);
          return []; // Return empty array if data is missing
        }
        const apiMarketGroup = data.marketGroups; // Rename destructured variable
        const currentTimestamp = Math.floor(Date.now() / 1000);

        return apiMarketGroup.map((marketGroup: ApiMarketGroupResponse) => {
          // Use ApiMarketGroupResponse type
          // Transform the structure to match the expected Market interface
          const market: ApiMarket = {
            // Use ApiMarketResponse type
            id: marketGroup.market.id,
            marketId: marketGroup.market.marketId,
            startTimestamp: marketGroup.market.startTimestamp,
            endTimestamp: marketGroup.market.endTimestamp,
            // Adjust public logic based on settled field if it exists in response
            public:
              marketGroup.market.settled !== undefined
                ? !marketGroup.market.settled
                : true,
            question: marketGroup.market.question,
            startingSqrtPriceX96: marketGroup.market.startingSqrtPriceX96,
            baseAssetMinPriceTick: marketGroup.market.baseAssetMinPriceTick,
            baseAssetMaxPriceTick: marketGroup.market.baseAssetMaxPriceTick,
            poolAddress: marketGroup.market.poolAddress,
            claimStatementYesOrNumeric:
              marketGroup.market.marketParamsClaimstatementYesOrNumeric,
            claimStatementNo: marketGroup.market.marketParamsClaimstatementNo,
            // Add other fields required by ApiMarket if they exist in ApiMarketResponse
            settled: marketGroup.market.settled,
            optionName: marketGroup.market.optionName,
          };

          const sortedMarkets = [...[market]].sort(
            (a, b) => a.startTimestamp - b.startTimestamp
          );

          const currentMarket =
            sortedMarkets.find(
              (market) =>
                market.startTimestamp <= currentTimestamp &&
                market.endTimestamp > currentTimestamp
            ) ||
            sortedMarkets[sortedMarkets.length - 1] ||
            null;

          const nextMarket =
            sortedMarkets.find(
              (market) => market.startTimestamp > currentTimestamp
            ) ||
            sortedMarkets[sortedMarkets.length - 1] ||
            null;

          return {
            id: marketGroup.id,
            name: marketGroup.question || `Market ${marketGroup.id}`, // Use question as name fallback
            chainId: marketGroup.chainId,
            address: marketGroup.address,
            collateralAsset: marketGroup.baseTokenName || 'ETH', // Fallback
            baseTokenName: marketGroup.baseTokenName,
            owner: marketGroup.address, // Fallback
            isCumulative: false, // Default
            question: marketGroup.question, // Keep the group-level question if needed
            resource: {
              id: 0,
              name: 'Unknown',
              slug: 'unknown',
            }, // Default resource info
            market,
            currentMarket,
            nextMarket,
          };
        });
      } catch (error) {
        console.error('Error fetching market groups via GraphQL:', error);
        throw error;
      }
    },
  });

  // Fetch stEthPerToken
  useEffect(() => {
    const fetchStEthPerToken = async () => {
      try {
        const data = await mainnetClient.readContract({
          address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
          abi: [
            {
              inputs: [],
              name: 'stEthPerToken',
              outputs: [
                {
                  internalType: 'uint256',
                  name: '',
                  type: 'uint256',
                },
              ],
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'stEthPerToken',
        });
        setStEthPerToken(Number(gweiToEther(data as bigint)));
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Error fetching stETH per token',
          description:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred',
        });
      }
    };

    fetchStEthPerToken();
  }, [toast]);

  /*
  // Handle InstallDialog visibility
  useEffect(() => {
    const alreadyShown = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (alreadyShown) {
      return;
    }

    // Check if we're on mobile and not in standalone mode
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia(
      '(display-mode: standalone)'
    ).matches;

    if (isMobile && !isStandalone) {
      setIsInstallDialogOpen(true);
    }
  }, []);

  const handleInstallDialogClose = (open: boolean) => {
    if (!open) {
      // Only set when closing the dialog
      localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
    }
    setIsInstallDialogOpen(open);
  };
*/
  return (
    <SapienceContext.Provider
      value={{
        // Permit data
        permitData,
        isPermitLoading,
        permitError,
        refetchPermitData,

        // Market data
        marketGroups: marketGroups || [],
        isMarketsLoading,
        marketsError,
        refetchMarketGroup,
        stEthPerToken,
      }}
    >
      {children}
      {/* <InstallDialog
        isOpen={isInstallDialogOpen}
        onOpenChange={handleInstallDialogClose}
      /> */}
    </SapienceContext.Provider>
  );
};

export const useSapience = () => {
  const context = useContext(SapienceContext);
  if (context === undefined) {
    throw new Error('useSapience must be used within a SapienceProvider');
  }
  return context;
};

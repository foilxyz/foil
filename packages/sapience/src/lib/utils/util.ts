import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createPublicClient, formatEther, http } from 'viem';
import * as chains from 'viem/chains';
import { mainnet } from 'viem/chains';
import type { MarketType, TransactionType } from '@sapience/ui/types';

export const foilApi = {
  baseUrl: process.env.NEXT_PUBLIC_FOIL_API_URL || '',
  token: process.env.NEXT_PUBLIC_FOIL_API_TOKEN,

  getHeaders() {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  },

  async post(path: string, body: unknown) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    return response.json();
  },

  async get(path: string) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    return response.json();
  },
};

// Mainnet client for ENS resolution and stEthPerToken query
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? http(
        `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      )
    : http('https://ethereum-rpc.publicnode.com'),
});

export const gweiToEther = (gweiValue: bigint): string => {
  // First, convert gwei to wei (multiply by 10^9)
  const weiValue = gweiValue * BigInt(1e9);
  // Then use formatEther to convert wei to ether as a string
  return formatEther(weiValue);
};

export const formatNumber = (value: number, decimals: number = 2): string => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Formats a question string by capitalizing the first letter and ensuring it ends with a question mark
 */
export const formatQuestion = (
  rawQuestion: string | null | undefined
): string | null => {
  if (!rawQuestion) {
    return null; // Return null if input is null or undefined
  }
  // Format the question - ensure it has proper capitalization and ends with a question mark
  let formattedQuestion = rawQuestion.trim();

  // Capitalize first letter if it's not already capitalized
  if (formattedQuestion.length > 0 && !/^[A-Z]/.test(formattedQuestion)) {
    formattedQuestion =
      formattedQuestion.charAt(0).toUpperCase() + formattedQuestion.slice(1);
  }

  // Add question mark if missing
  if (!formattedQuestion.endsWith('?')) {
    formattedQuestion += '?';
  }

  return formattedQuestion;
};

/**
 * Determines which question to display based on active markets and market group data
 * This implements the comprehensive logic used across market group lists and headers
 */
export const getDisplayQuestion = (
  marketGroupData:
    | { question?: string | null; markets?: MarketType[] }
    | null
    | undefined,
  activeMarkets?: MarketType[], // Make activeMarkets optional
  isLoading: boolean = false,
  defaultLoadingMessage: string = '', // Default loading message
  defaultErrorMessage: string = 'This market question is not available' // Default error message
): string => {
  // Helper function to format question or return default message
  const formatOrDefault = (question: string | null | undefined): string => {
    const formatted = formatQuestion(question);
    return formatted || defaultErrorMessage; // Use the provided default error message
  };

  // Handle loading state first
  if (isLoading) {
    return defaultLoadingMessage;
  }

  // Handle null, undefined, or placeholder data
  if (!marketGroupData) {
    return defaultErrorMessage;
  }

  // If activeMarkets is not provided, calculate it
  const markets = activeMarkets || findActiveMarkets(marketGroupData);

  // Comprehensive Logic matching MarketGroupsList:
  // 1. If we have multiple active markets, use market group question
  if (markets.length > 1 && marketGroupData.question) {
    return formatOrDefault(marketGroupData.question);
  }

  // 2. If we have exactly one active market with a question, use that
  if (markets.length === 1 && markets[0]?.question) {
    return formatOrDefault(markets[0].question);
  }

  // 3. Fallback to market group question
  if (marketGroupData.question) {
    return formatOrDefault(marketGroupData.question);
  }

  // 4. Fallback to first market with a question (sorted by start time)
  if (marketGroupData.markets && marketGroupData.markets.length > 0) {
    const firstMarketWithQuestion = [...marketGroupData.markets]
      .sort((a, b) => {
        const aStart =
          typeof a.startTimestamp === 'number' ? a.startTimestamp : 0;
        const bStart =
          typeof b.startTimestamp === 'number' ? b.startTimestamp : 0;
        return aStart - bStart;
      })
      .find((market: MarketType) => market.question);

    if (firstMarketWithQuestion?.question) {
      return formatOrDefault(firstMarketWithQuestion.question);
    }
  }

  // Final Fallback: If no question found anywhere, return the default error message.
  return defaultErrorMessage;
};

/**
 * Determines which question to display for market headers specifically
 * Handles the simpler logic used in individual market pages
 */
export const getMarketHeaderQuestion = (
  marketGroupData:
    | {
        question?: string | null;
        markets?: MarketType[];
        resource?: { name: string } | null;
      }
    | null
    | undefined,
  activeMarket?: MarketType | null
): string => {
  const markets = marketGroupData?.markets;
  const hasOnlyOneMarket = markets && markets.length === 1;

  if (hasOnlyOneMarket && activeMarket?.question) {
    return formatQuestion(activeMarket.question) || activeMarket.question;
  }

  return (
    formatQuestion(marketGroupData?.question) ||
    marketGroupData?.question ||
    `${marketGroupData?.resource?.name} Market`
  );
};

/**
 * Finds active markets for a market group based on current timestamp
 */
export const findActiveMarkets = (marketGroupData: {
  markets?: MarketType[];
}): MarketType[] => {
  const nowInSeconds = Date.now() / 1000;
  // Filter markets based on timestamps
  return (marketGroupData.markets || []).filter(
    (
      market: MarketType // Use MarketType here
    ) => {
      // Check if timestamps are valid numbers before comparison
      const start = market.startTimestamp;
      const end = market.endTimestamp;
      // Ensure start and end are numbers (GraphQL types might be nullable)
      return (
        typeof start === 'number' &&
        !Number.isNaN(start) &&
        typeof end === 'number' &&
        !Number.isNaN(end) &&
        nowInSeconds >= start &&
        nowInSeconds < end
      );
    }
  );
};

// Helper to format value as percentage (0-1 -> 0%-100%)
export const formatPercentage = (value: number): string => {
  if (value == null || Number.isNaN(value)) return ''; // Use Number.isNaN
  return `${(value * 100).toFixed(0)}%`; // Multiply by 100, format, add %
};

// Helper to format a numeric value (like a price) to a specified number of decimal places, optionally adding a unit.
export const formatTokenValue = (
  value: number | string | undefined | null,
  unit: string = '',
  decimals: number = 2
): string => {
  if (value === undefined || value === null) {
    return ''; // Handle undefined/null
  }

  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(numericValue)) {
    // Use Number.isNaN
    return ''; // Handle NaN or non-numeric strings
  }

  const formattedNumber = numericValue.toFixed(decimals);
  return unit ? `${formattedNumber} ${unit}` : formattedNumber;
};

// Helper to determine Y-axis configuration based on market type
export const getYAxisConfig = (
  marketGroup:
    | { baseTokenName?: string | null; quoteTokenName?: string | null }
    | null
    | undefined
) => {
  // Check for Yes/No market (based on base token name)
  // Removed isGroupMarket check as it's not directly on MarketGroupType
  if (marketGroup?.baseTokenName === 'Yes') {
    // Yes/No market: Percentage 0%-100%
    return {
      tickFormatter: formatPercentage, // Use percentage formatter
      tooltipValueFormatter: (val: number) => formatPercentage(val), // Use percentage formatter
      domain: [0, 1] as [number, number], // Domain remains 0-1 (representing 0% to 100%)
      unit: '%', // Unit symbol
    };
  }

  // Default/Numerical market: Use quote token name, adjust decimals
  // Construct the unit string as quote/base
  let unit = '';
  if (marketGroup?.baseTokenName && marketGroup?.quoteTokenName) {
    // Construct unit like "quote/base"
    unit = `${marketGroup.quoteTokenName}/${marketGroup.baseTokenName}`;
  } else if (marketGroup?.quoteTokenName) {
    // Fallback to just quote token name if base is missing
    unit = marketGroup.quoteTokenName;
  }

  return {
    tickFormatter: (val: number) => formatTokenValue(val), // Remove unit from tick formatter call
    tooltipValueFormatter: (val: number) => formatTokenValue(val, unit), // Keep unit for tooltip
    domain: ['auto', 'auto'] as [string | number, string | number], // Auto-scale
    unit, // Keep the constructed unit for potential future use
  };
};

// Helper to format timestamp for XAxis ticks (example: DD/MM)
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
  return `${month}/${day}`;
};

// Utility to get chainId from chain short name
export const getChainIdFromShortName = (shortName: string): number => {
  switch (shortName?.toLowerCase()) {
    case 'base':
      return 8453;
    case 'arbitrum':
      return 42161;
    case 'ethereum':
    case 'mainnet':
      return 1;
    default:
      console.warn(`Unknown chain short name: ${shortName}`);
      return 0; // Return 0 or handle error appropriately
  }
};

// Helper function to get chain short name from chainId
export const getChainShortName = (id: number): string => {
  const chainObj = Object.values(chains).find((chain) => chain.id === id);
  return chainObj
    ? chainObj.name.toLowerCase().replace(/\s+/g, '')
    : id.toString();
};

// Parse URL parameter to extract chain and market address
export const parseUrlParameter = (
  paramString: string
): { chainShortName: string; marketAddress: string; chainId: number } => {
  // URL decode the parameter first, then parse
  const decodedParam = decodeURIComponent(paramString);

  // More robust parsing to handle various URL format possibilities
  let chainShortName = '';
  let marketAddress = '';

  if (decodedParam) {
    // Check if the parameter contains a colon (chain:address format)
    if (decodedParam.includes(':')) {
      const [parsedChain, parsedAddress] = decodedParam.split(':');
      chainShortName = parsedChain;
      marketAddress = parsedAddress;
    } else {
      // If no colon, assume it's just the address
      marketAddress = decodedParam;
      // Use a default chain if needed
      chainShortName = 'base';
    }
  }

  const chainId = getChainIdFromShortName(chainShortName);

  return { chainShortName, marketAddress, chainId };
};

// --- Function: Calculate Effective Entry Price ---

/**
 * Helper function to check if position direction has flipped
 */
function hasPositionFlipped(
  isLong: boolean,
  totalBaseTokenDelta: number
): boolean {
  return (
    (isLong && totalBaseTokenDelta <= 0) ||
    (!isLong && totalBaseTokenDelta >= 0)
  );
}

/**
 * Helper function to calculate final entry price
 */
function calculateFinalPrice(
  totalBaseTokenDelta: number,
  totalQuoteTokenDelta: number,
  isLong: boolean
): number {
  if (totalBaseTokenDelta === 0) {
    return 0; // Avoid division by zero
  }

  // For short positions, we negate both values to get the correct ratio
  let adjustedBase = totalBaseTokenDelta;
  let adjustedQuote = totalQuoteTokenDelta;

  if (!isLong) {
    adjustedBase = -totalBaseTokenDelta;
    adjustedQuote = -totalQuoteTokenDelta;
  }

  // Calculate the entry price as the ratio of quote tokens to base tokens
  return Math.abs(adjustedQuote / adjustedBase);
}

/**
 * Calculate the effective entry price for a position based on its transactions
 * Uses the UI package TransactionType
 */
export function calculateEffectiveEntryPrice(
  transactions: TransactionType[], // Use TransactionType[]
  isLong: boolean
): number {
  if (!transactions || transactions.length === 0) {
    return 0;
  }

  // Sort transactions by timestamp (oldest first)
  const sortedTransactions = [...transactions].sort(
    (a, b) =>
      (new Date(a.createdAt).getTime() || 0) -
      (new Date(b.createdAt).getTime() || 0)
  );

  // Initialize entry price calculation variables
  let totalBaseTokenDelta = 0;
  let totalQuoteTokenDelta = 0;

  // Process transactions to calculate deltas
  for (const tx of sortedTransactions) {
    // Skip non-trade transactions
    if (tx.type === 'long' || tx.type === 'short') {
      // Parse token deltas safely, handling null/undefined and converting from wei string
      // Use the correct property names from the GraphQL Transaction type
      const baseTokenDelta = parseFloat(
        formatEther(BigInt(tx.baseToken ?? '0'))
      );
      const quoteTokenDelta = parseFloat(
        formatEther(BigInt(tx.quoteToken ?? '0'))
      );

      // Accumulate deltas
      totalBaseTokenDelta += baseTokenDelta;
      totalQuoteTokenDelta += quoteTokenDelta;

      // If we've reached a point where the position is flipped, reset calculations
      if (hasPositionFlipped(isLong, totalBaseTokenDelta)) {
        totalBaseTokenDelta = 0;
        totalQuoteTokenDelta = 0;
      }
    }
  }

  return calculateFinalPrice(totalBaseTokenDelta, totalQuoteTokenDelta, isLong);
}

/**
 * Converts a Uniswap V3 tick index to a price.
 * Formula: price = 1.0001^tick
 * @param tick The tick index.
 * @returns The price corresponding to the tick.
 */
export function tickToPrice(tick: number | string | undefined | null): number {
  if (tick === undefined || tick === null) {
    return 0; // Or handle as appropriate, e.g., throw an error or return NaN
  }
  const numericTick = typeof tick === 'string' ? Number(tick) : tick;
  if (Number.isNaN(numericTick)) {
    // Use Number.isNaN
    return 0; // Handle invalid string input
  }
  return 1.0001 ** numericTick;
}

/**
 * Converts settlementSqrtPriceX96 to settlementPriceD18
 * @param settlementSqrtPriceX96 sqrt price in X96 format as bigint
 * @returns bigint price with 18 decimals
 */
export const sqrtPriceX96ToPriceD18 = (sqrtPriceX96: bigint): bigint => {
  // 2^192
  return (
    (sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** 18)) /
    BigInt('6277101735386680763835789423207666416102355444464034512896')
  );
};

/**
 * Converts a price to sqrtPriceX96 format used by Uniswap V3
 * @param price The price to convert
 * @returns The sqrtPriceX96 value
 */
export const priceToSqrtPriceX96 = (price: number): bigint => {
  // Calculate the square root of the price
  const sqrtPrice = BigInt(Math.floor(Math.sqrt(price) * 10 ** 18)); // 10^18 is the precision of the sqrt price

  // Calculate 2^96 without using bigint exponentiation
  const Q96 = BigInt('79228162514264337593543950336');

  // Convert to bigint format required by the Uniswap contracts
  return BigInt(sqrtPrice * Q96) / BigInt(10 ** 18);
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function bigIntAbs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value;
}

export const shortenAddress = (address: string) => {
  if (!address) return '';
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

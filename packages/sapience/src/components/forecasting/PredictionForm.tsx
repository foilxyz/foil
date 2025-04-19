import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
import { Button } from '@foil/ui/components/ui/button';
import { Input } from '@foil/ui/components/ui/input';
import { Label } from '@foil/ui/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@foil/ui/components/ui/popover';
import { useToast } from '@foil/ui/hooks/use-toast';
import debounce from 'lodash/debounce';
import { HelpCircle, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  parseUnits,
  formatUnits,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { useAccount, useWriteContract, useTransaction } from 'wagmi';

import PredictionInput from './PredictionInput';

// EAS constants
const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021';
const SCHEMA_UID =
  '0x8c6ff62d30ea7aa47f0651cd5c1757d47539f8a303888c61d3f19c7502fa9a24';

// Define a local type matching the component's usage until correct import path is found
// Consider moving this to a shared types file if used elsewhere
interface PredictionMarketType {
  optionNames?: string[] | null;
  baseTokenName?: string | null;
  quoteTokenName?: string | null;
  markets?: {
    id?: string;
    marketId: string | number;
    question?: string;
    startTimestamp?: number | string | null;
    endTimestamp?: number | string | null;
    settled?: boolean;
  }[];
  address?: string;
  chainId?: number;
  lowerBound?: string | null; // Add lowerBound
  upperBound?: string | null; // Add upperBound
}

interface PredictionFormData {
  predictionValue: string | number;
  wagerAmount: string;
}

interface PermitDataType {
  permitted?: boolean;
}

interface PredictionFormProps {
  marketData: PredictionMarketType | null | undefined;
  formData: PredictionFormData;
  setFormData: React.Dispatch<React.SetStateAction<PredictionFormData>>;
  activeTab: 'predict' | 'wager';
  handleTabChange: (tab: 'predict' | 'wager') => void;
  handlePredictionChange: (value: string | number) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void; // Add submit handler prop
  isPermitLoadingPermit: boolean;
  permitData: PermitDataType | null | undefined;
  activeButtonStyle?: string;
  inactiveButtonStyle?: string;
  currentMarketId?: string | null; // Added prop for current market ID
}

// Define type for quoter response data
interface QuoteData {
  direction: 'LONG' | 'SHORT';
  maxSize: string; // BigInt string
  currentPrice: string; // Decimal string
  expectedPrice: string; // Decimal string
  collateralAvailable: string; // BigInt string
}

const defaultActiveStyle =
  'bg-primary text-primary-foreground hover:bg-primary/90';
const defaultInactiveStyle =
  'bg-secondary text-secondary-foreground hover:bg-secondary/80';

// Helper function to check if a market is active (extracted for complexity reduction)
const isMarketActive = (
  market: {
    marketId: string | number;
    startTimestamp?: number | string | null;
    endTimestamp?: number | string | null;
  },
  now: number
): boolean => {
  const start = market.startTimestamp
    ? parseInt(String(market.startTimestamp), 10)
    : null;
  const end = market.endTimestamp
    ? parseInt(String(market.endTimestamp), 10)
    : null;

  if (start === null || isNaN(start) || end === null || isNaN(end)) {
    console.warn(`Market ${market.marketId} has invalid or missing timestamps`);
    return false;
  }
  return now >= start && now < end;
};

const PredictionForm: React.FC<PredictionFormProps> = ({
  marketData,
  formData,
  setFormData, // Receive setFormData to update wagerAmount directly
  activeTab,
  handleTabChange,
  handlePredictionChange,
  handleSubmit: externalHandleSubmit, // Rename to avoid conflict
  isPermitLoadingPermit,
  permitData,
  activeButtonStyle = defaultActiveStyle,
  inactiveButtonStyle = defaultInactiveStyle,
  currentMarketId, // Destructure the new prop
}) => {
  // Wagmi hooks
  const { address } = useAccount();
  const router = useRouter(); // Get router instance
  const { toast } = useToast(); // Get toast function

  // --- New logic to determine input type based on active markets ---
  const { activeOptionNames, unitDisplay, displayMarketId } = useMemo<{
    activeOptionNames: string[] | null | undefined;
    unitDisplay: string | null;
    displayMarketId: string | number | null;
  }>(() => {
    // Simplified check and early return
    if (!marketData?.markets?.length) {
      return {
        activeOptionNames: null,
        unitDisplay: null,
        displayMarketId: null,
      };
    }

    const now = Math.floor(Date.now() / 1000); // Current time in seconds

    // Use helper function for filtering active markets
    const activeMarkets = marketData.markets.filter((market) =>
      isMarketActive(market, now)
    );

    // Handle no active markets
    if (!activeMarkets.length) {
      return {
        activeOptionNames: null,
        unitDisplay: null,
        displayMarketId: null,
      };
    }

    // Determine the display market (prioritize currentMarketId if valid & active)
    const activeMarketIds = activeMarkets.map((m) => m.marketId);
    let currentDisplayMarketId = null;
    // Simplified conditional assignment
    if (currentMarketId && activeMarketIds.includes(currentMarketId)) {
      currentDisplayMarketId = currentMarketId;
    } else {
      currentDisplayMarketId = activeMarkets[0].marketId; // Fallback to first active
    }

    // Determine output based on number of active markets
    if (activeMarkets.length > 1) {
      // Multiple active markets: Use optionNames from the market group
      return {
        activeOptionNames: marketData.optionNames,
        unitDisplay: null,
        displayMarketId: currentDisplayMarketId,
      };
    }

    // Single active market logic (since length > 0 and not > 1)
    const isYesNoRange =
      marketData.lowerBound === '-92200' && marketData.upperBound === '0';
    if (isYesNoRange) {
      return {
        activeOptionNames: null,
        unitDisplay: null,
        displayMarketId: currentDisplayMarketId,
      };
    }

    // Numerical input - construct unit display string
    const base = marketData.baseTokenName;
    const quote = marketData.quoteTokenName;
    let displayString = base || 'units'; // Default to base or 'units'
    if (base && quote) {
      displayString = `${quote} / ${base}`;
    } else if (quote) {
      displayString = quote; // Fallback if only quote exists
    }

    return {
      activeOptionNames: null,
      unitDisplay: displayString,
      displayMarketId: currentDisplayMarketId,
    };
  }, [marketData, currentMarketId]);
  // --- End of new logic ---

  // Effect to set default prediction value based on market type
  useEffect(() => {
    // Only run if an active market is identified
    if (!displayMarketId) return;

    setFormData((prevFormData) => {
      let newPredictionValue = prevFormData.predictionValue;
      const currentPredictionValue = prevFormData.predictionValue;

      if (activeOptionNames && activeOptionNames.length > 0) {
        // Group market: Default to first option (value = 1) if current value is invalid
        const isValidOption =
          typeof currentPredictionValue === 'number' &&
          currentPredictionValue >= 1 &&
          currentPredictionValue <= activeOptionNames.length;
        if (!isValidOption) {
          newPredictionValue = 1; // Default to the first option (index 0 -> value 1)
        }
      } else if (marketData?.baseTokenName?.toLowerCase() === 'yes') {
        // Yes/No market: Default to 'Yes' (value = '1') if current value isn't '0' or '1'
        if (currentPredictionValue !== '0' && currentPredictionValue !== '1') {
          newPredictionValue = '1'; // Default to 'Yes'
        }
      } else if (
        unitDisplay &&
        (currentPredictionValue === '0' || currentPredictionValue === '1')
      ) {
        newPredictionValue = ''; // Reset to empty string for numerical input
      }
      // Only update state if the value needs to change
      if (newPredictionValue !== currentPredictionValue) {
        return { ...prevFormData, predictionValue: newPredictionValue };
      }
      return prevFormData; // No change needed
    });
  }, [
    displayMarketId,
    activeOptionNames,
    marketData?.baseTokenName,
    unitDisplay,
    setFormData,
  ]);

  // Add debugging information
  console.log('PredictionForm calculated values:', {
    activeOptionNames,
    unitDisplay,
    displayMarketId,
    marketData,
  });

  // Derive isGroupMarket based on the number of active markets
  const isGroupMarket = useMemo(() => {
    if (!marketData?.markets) return false;
    const now = Math.floor(Date.now() / 1000);
    const activeMarkets = marketData.markets.filter((market) => {
      const start = market.startTimestamp
        ? parseInt(String(market.startTimestamp), 10)
        : null;
      const end = market.endTimestamp
        ? parseInt(String(market.endTimestamp), 10)
        : null;
      if (start === null || isNaN(start) || end === null || isNaN(end)) {
        return false;
      }
      return now >= start && now < end;
    });
    return activeMarkets.length > 1;
  }, [marketData]);

  // State for attestation status
  const [attestationError, setAttestationError] = useState<string | null>(null);
  const [attestationSuccess, setAttestationSuccess] = useState<string | null>(
    null
  );

  // State for quoter integration
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Helper function for integer square root using BigInt (Babylonian method)
  const isqrt = (n: bigint): bigint => {
    if (n < BigInt(0))
      throw new Error('Square root of negative number is not real.');
    if (n === BigInt(0)) return BigInt(0);
    let x = n;
    let y = (x + n / x) / BigInt(2);
    while (y < x) {
      x = y;
      y = (x + n / x) / BigInt(2);
    }
    // Check if y*y is closer than x*x to n
    if (y * y > n && x * x <= n) {
      return x;
    }
    return y;
  };

  // Helper for BigInt power
  const bigIntPow = (base: bigint, exp: bigint): bigint => {
    let res = BigInt(1);
    let currentBase = base;
    let currentExp = exp;
    while (currentExp > BigInt(0)) {
      if (currentExp % BigInt(2) === BigInt(1)) {
        res *= currentBase;
      }
      currentBase *= currentBase;
      currentExp /= BigInt(2);
    }
    return res;
  };

  // Function to convert number to sqrtPriceX96 using BigInt
  const convertToSqrtPriceX96 = (price: number): string => {
    if (typeof price !== 'number' || isNaN(price) || price < 0) {
      return 'Invalid Price';
    }

    // Define constants using BigInt() constructor
    const DECIMALS = 18;
    const TEN = BigInt(10);
    const TWO = BigInt(2);
    const NINETY_SIX = BigInt(96);

    // Pre-calculate powers using BigInt multiplication or helper if ** is not supported reliably
    const SQRT_TEN_POW_DECIMALS = bigIntPow(TEN, BigInt(DECIMALS / 2)); // e.g., 10^9
    const TWO_POW_96 = bigIntPow(TWO, NINETY_SIX);

    try {
      // Scale the price - handle potential floating point inaccuracies
      const scaledPriceNumber = price * 10 ** DECIMALS;
      // Use string conversion for potentially large or precise floats before BigInt
      const scaledPriceBI = BigInt(Math.round(scaledPriceNumber));

      // Calculate integer square root of the scaled price
      const sqrtScaledPrice = isqrt(scaledPriceBI);

      // Calculate sqrtPriceX96: (sqrt(scaledPrice) * 2^96) / sqrt(10^18)
      const sqrtPriceX96 =
        (sqrtScaledPrice * TWO_POW_96) / SQRT_TEN_POW_DECIMALS;

      return sqrtPriceX96.toString();
    } catch (error) {
      console.error('Error calculating sqrtPriceX96:', error);
      return 'Calculation Error';
    }
  };

  const TWO = BigInt(2);
  const NINETY_SIX = BigInt(96);

  // Helper for BigInt power (defined once)
  const TWO_POW_96 = bigIntPow(TWO, NINETY_SIX); // 2^96

  // Calculate submission value
  const submissionValue = useMemo(() => {
    if (!marketData) return 'N/A';

    // Check specifically for "No"
    if (
      typeof formData.predictionValue === 'string' &&
      formData.predictionValue === '0' &&
      marketData.baseTokenName?.toLowerCase() === 'yes'
    ) {
      return '0';
    }

    // Case 1: Multiple optionNames OR Yes/No market where 'Yes' is selected
    if (
      (marketData.optionNames &&
        marketData.optionNames.length > 1 &&
        typeof formData.predictionValue === 'number' &&
        formData.predictionValue >= 1 &&
        formData.predictionValue <= marketData.optionNames.length) ||
      (marketData.baseTokenName?.toLowerCase() === 'yes' &&
        formData.predictionValue === '1')
    ) {
      // For options or yes, the price is 1. The sqrtPriceX96 value is 2^96.
      return TWO_POW_96.toString();
    }

    // Case 3: Numerical input (check if unitDisplay exists, indicating numerical market)
    if (unitDisplay && typeof formData.predictionValue === 'string') {
      const numValue = parseFloat(formData.predictionValue);
      // Check if parsing was successful and the number is non-negative
      if (
        !isNaN(numValue) &&
        numValue >= 0 &&
        formData.predictionValue.trim() !== '' &&
        formData.predictionValue.trim() !== '.'
      ) {
        return convertToSqrtPriceX96(numValue);
      }
      // If input is invalid (NaN, negative, empty, or just "."), return N/A for submission
      return 'N/A';
    }

    // Default case or if predictionValue is not a number for numerical market
    return 'N/A';
  }, [marketData, formData.predictionValue, TWO_POW_96, unitDisplay]);
  console.log('submissionValue', submissionValue);

  // Calculate expectedPrice for the quoter
  const expectedPriceForQuoter = useMemo(() => {
    if (!marketData) return null;

    // Case 1: Yes/No or Multi-option where 'Yes' is selected
    if (
      (marketData.baseTokenName?.toLowerCase() === 'yes' &&
        typeof formData.predictionValue === 'string' &&
        formData.predictionValue.toLowerCase() === 'yes') ||
      (marketData.optionNames &&
        marketData.optionNames.length > 1 &&
        typeof formData.predictionValue === 'string' &&
        formData.predictionValue.toLowerCase() === 'yes') // Assuming 'yes' maps to price 1 in multi-option for simplicity
    ) {
      return 1;
    }

    // Case 2: Yes/No or Multi-option where 'No' is selected
    if (
      (marketData.baseTokenName?.toLowerCase() === 'yes' && // Still check baseTokenName to confirm market type
        typeof formData.predictionValue === 'string' &&
        formData.predictionValue.toLowerCase() === 'no') ||
      (marketData.optionNames &&
        marketData.optionNames.length > 1 &&
        typeof formData.predictionValue === 'string' &&
        formData.predictionValue.toLowerCase() === 'no') // Assuming 'no' maps to price 0
    ) {
      return 0;
    }

    // Case 3: Numerical input
    if (typeof formData.predictionValue === 'number') {
      return formData.predictionValue;
    }

    // Default: Cannot determine price
    return null;
  }, [marketData, formData.predictionValue]);

  // Debounced fetch function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedFetchQuote = useCallback(
    debounce(
      async (params: {
        chainId: number;
        marketAddress: string;
        marketId: string;
        expectedPrice: number;
        collateralAvailable: bigint;
      }) => {
        const {
          chainId,
          marketAddress,
          marketId,
          expectedPrice,
          collateralAvailable,
        } = params;

        // Only fetch if collateral amount is positive
        if (collateralAvailable <= BigInt(0)) {
          setQuoteData(null);
          setQuoteError(null);
          setIsQuoteLoading(false);
          return;
        }

        setIsQuoteLoading(true);
        setQuoteError(null);
        setQuoteData(null); // Clear previous quote data

        try {
          // Construct the URL using the established environment variable pattern
          const apiBaseUrl = process.env.NEXT_PUBLIC_FOIL_API_URL || ''; // Use specific FOIL API URL
          const apiUrl = `${apiBaseUrl}/quoter/${chainId}/${marketAddress}/${marketId}/?expectedPrice=${expectedPrice}&collateralAvailable=${collateralAvailable.toString()}`;
          console.log('Fetching quote from:', apiUrl); // Debug log

          const response = await fetch(apiUrl);
          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.error || `HTTP error! status: ${response.status}`
            );
          }

          console.log('Quote received:', data); // Debug log
          setQuoteData(data as QuoteData);
        } catch (error: unknown) {
          console.error('Error fetching quote:', error);
          // Check for the specific error message and replace it
          let finalErrorMessage = 'Failed to fetch quote'; // Default message
          if (error instanceof Error) {
            finalErrorMessage =
              error.message ===
              'Could not find a valid position size that satisfies the price constraints'
                ? 'The market cannot accept this wager due insufficient liquidity.'
                : error.message;
          }
          setQuoteError(finalErrorMessage);
          setQuoteData(null); // Clear data on error
        } finally {
          setIsQuoteLoading(false);
        }
      },
      500
    ), // 500ms debounce delay
    [] // Dependencies for useCallback, typically empty for debounced functions unless props/state used *outside* the debounce timer logic are needed.
  );

  // useEffect to trigger the debounced fetch when relevant inputs change
  useEffect(() => {
    if (
      activeTab === 'wager' &&
      marketData?.chainId &&
      marketData?.address &&
      displayMarketId &&
      expectedPriceForQuoter !== null && // Ensure we have a valid price
      formData.wagerAmount // Ensure wager amount is not empty
    ) {
      try {
        // Format collateral amount (assuming 18 decimals for sUSDS)
        const collateralAmountBI = parseUnits(
          formData.wagerAmount as `${number}`,
          18
        );

        // Merge the check for > 0 here
        if (collateralAmountBI > BigInt(0)) {
          debouncedFetchQuote({
            chainId: marketData.chainId,
            marketAddress: marketData.address,
            marketId: displayMarketId.toString(),
            expectedPrice: expectedPriceForQuoter,
            collateralAvailable: collateralAmountBI,
          });
        } else {
          // If wager is zero or invalid, clear quote state
          setQuoteData(null);
          setQuoteError(null);
          setIsQuoteLoading(false);
        }
      } catch (error) {
        // Handle potential parsing errors for wagerAmount
        console.error('Error parsing wager amount:', error);
        setQuoteData(null);
        setQuoteError('Invalid wager amount entered.');
        setIsQuoteLoading(false);
      }
    } else {
      // Clear quote state if conditions are not met (e.g., switching tabs, clearing wager)
      setQuoteData(null);
      setQuoteError(null);
      setIsQuoteLoading(false);
      // Cancel any pending debounced calls if dependencies change and conditions are no longer met
      debouncedFetchQuote.cancel();
    }

    // Cleanup function to cancel debounce on unmount or when dependencies change drastically
    return () => {
      debouncedFetchQuote.cancel();
    };
  }, [
    activeTab,
    marketData?.chainId,
    marketData?.address,
    displayMarketId,
    expectedPriceForQuoter,
    formData.wagerAmount,
    debouncedFetchQuote, // Include debounced function in dependency array
  ]);

  // EAS contract write hook
  const {
    writeContract,
    data: attestData,
    isPending: isAttesting,
    error: writeError,
  } = useWriteContract();

  // Wait for transaction
  const { data: txReceipt, isSuccess: txSuccess } = useTransaction({
    hash: attestData,
  });

  // Set success message when transaction completes
  useEffect(() => {
    if (txSuccess && txReceipt) {
      // Set success state locally (optional, as we redirect)
      setAttestationSuccess(
        `Prediction submitted successfully! Transaction: ${txReceipt.hash}`
      );

      // Show toast
      toast({
        title: 'Prediction Submitted',
        description: 'Your position will appear on your profile shortly.',
        duration: 5000, // Optional: duration in ms
      });

      // Redirect
      if (address) {
        router.push(`/profile/${address}`);
      }
    }
  }, [txSuccess, txReceipt, address, router, toast]); // Add dependencies

  // Set error message if write fails
  useEffect(() => {
    if (writeError) {
      setAttestationError(writeError.message);
    }
  }, [writeError]);

  // Helper function to encode schema data
  const encodeSchemaData = useCallback(
    (marketAddress: string, marketId: string, prediction: string) => {
      try {
        // Encode the data according to the schema "address marketAddress,uint256 marketId,uint160 prediction"
        return encodeAbiParameters(
          parseAbiParameters(
            'address marketAddress, uint256 marketId, uint160 prediction'
          ),
          [marketAddress as `0x${string}`, BigInt(marketId), BigInt(prediction)]
        );
      } catch (error) {
        console.error('Error encoding schema data:', error);
        throw new Error('Failed to encode prediction data');
      }
    },
    []
  );

  // Determine the market ID corresponding to the selected option index
  const selectedMarketId = useMemo(() => {
    if (
      !marketData?.markets ||
      !activeOptionNames ||
      typeof formData.predictionValue !== 'number'
    ) {
      // Not a group market, options not loaded, or selection not a number
      return displayMarketId; // Fallback to the primary display market ID
    }

    const selectedIndex = formData.predictionValue - 1; // Convert 1-based index to 0-based

    // Find active markets again (similar logic to displayMarketId derivation)
    const now = Math.floor(Date.now() / 1000);
    const activeMarkets = marketData.markets.filter((market) => {
      const start = market.startTimestamp
        ? parseInt(String(market.startTimestamp), 10)
        : null;
      const end = market.endTimestamp
        ? parseInt(String(market.endTimestamp), 10)
        : null;
      if (start === null || isNaN(start) || end === null || isNaN(end)) {
        return false;
      }
      return now >= start && now < end;
    });

    if (selectedIndex >= 0 && selectedIndex < activeMarkets.length) {
      // Return the marketId of the market at the selected index
      return activeMarkets[selectedIndex].marketId;
    }

    // Fallback if index is out of bounds (shouldn't happen with validation)
    return displayMarketId;
  }, [
    marketData?.markets,
    activeOptionNames,
    formData.predictionValue,
    displayMarketId,
  ]);

  // Helper function for handling wager submission
  const handleWagerSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      try {
        // Await the external handler
        await externalHandleSubmit(event);
        // Show toast on success
        toast({
          title: 'Wager Submitted',
          description: 'Your position will appear on your profile shortly.',
          duration: 5000,
        });
        // Redirect on success
        if (address) {
          router.push(`/profile/${address}`);
        }
      } catch (error) {
        // Let the external handler manage its own errors/toasts if needed
        console.error('Error during wager submission:', error);
        // Optionally show an error toast here if externalHandleSubmit doesn't
        // toast({ variant: 'destructive', title: 'Wager Failed', description: ... });
      }
    },
    [externalHandleSubmit, toast, address, router] // Dependencies
  );

  // Helper function for handling prediction (EAS Attestation) submission
  const handlePredictSubmit = useCallback(async () => {
    try {
      // Early exits for invalid states
      if (!address) {
        throw new Error('Wallet not connected');
      }
      if (!marketData?.address) {
        throw new Error('Market address not available');
      }
      // Explicitly check submissionValue validity before proceeding
      if (submissionValue === 'N/A') {
        console.error(
          'Attempted to submit prediction with invalid submission value.'
        );
        setAttestationError('Cannot submit prediction with the current input.');
        return; // Stop execution if value is invalid
      }

      const finalMarketId = selectedMarketId
        ? selectedMarketId.toString()
        : '0';

      // Encode the schema data (only if submissionValue is valid)
      const encodedData = encodeSchemaData(
        marketData.address,
        finalMarketId,
        submissionValue
      );

      // Submit the attestation using wagmi's writeContract
      writeContract({
        address: EAS_CONTRACT_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'attest',
            type: 'function',
            stateMutability: 'payable',
            inputs: [
              {
                name: 'request',
                type: 'tuple',
                components: [
                  { name: 'schema', type: 'bytes32' },
                  {
                    name: 'data',
                    type: 'tuple',
                    components: [
                      { name: 'recipient', type: 'address' },
                      { name: 'expirationTime', type: 'uint64' },
                      { name: 'revocable', type: 'bool' },
                      { name: 'refUID', type: 'bytes32' },
                      { name: 'data', type: 'bytes' },
                      { name: 'value', type: 'uint256' },
                    ],
                  },
                ],
              },
            ],
            outputs: [{ name: 'uid', type: 'bytes32' }],
          },
        ],
        functionName: 'attest',
        args: [
          {
            schema: SCHEMA_UID as `0x${string}`,
            data: {
              recipient:
                '0x0000000000000000000000000000000000000000' as `0x${string}`,
              expirationTime: BigInt(0),
              revocable: true,
              refUID:
                '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
              data: encodedData,
              value: BigInt(0),
            },
          },
        ],
      });
    } catch (error) {
      console.error('Attestation error:', error);
      setAttestationError(
        error instanceof Error ? error.message : 'Failed to submit prediction'
      );
    }
  }, [
    address,
    marketData,
    submissionValue,
    selectedMarketId,
    encodeSchemaData,
    writeContract,
    setAttestationError, // Add setAttestationError as dependency
  ]); // Dependencies for handlePredictSubmit

  // Custom handleSubmit that handles predict vs wager differently
  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Reset states
    setAttestationError(null);
    setAttestationSuccess(null);

    // For the wager tab, use the wager helper function
    if (activeTab === 'wager') {
      await handleWagerSubmit(event);
    }
    // For the predict tab, use the predict helper function
    else if (activeTab === 'predict') {
      await handlePredictSubmit();
    }
  };

  return (
    <form className="space-y-8" onSubmit={handleFormSubmit}>
      {/* Tabs Section */}
      <div className="space-y-2 mt-4">
        <div className="flex w-full border-b">
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-base font-medium text-center ${
              activeTab === 'predict'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
            onClick={() => handleTabChange('predict')}
          >
            Predict
          </button>
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-base font-medium text-center ${
              activeTab === 'wager'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
            onClick={() => handleTabChange('wager')}
          >
            Wager
          </button>
        </div>

        {/* Tab Content */}
        <div className="pt-2">
          {activeTab === 'predict' && (
            <div className="space-y-6">
              <div className="mt-1">
                <PredictionInput
                  market={{
                    optionNames: activeOptionNames,
                    baseTokenName:
                      marketData?.baseTokenName === null
                        ? undefined
                        : marketData?.baseTokenName,
                    quoteTokenName:
                      marketData?.quoteTokenName === null
                        ? undefined
                        : marketData?.quoteTokenName,
                    isGroupMarket,
                  }}
                  value={formData.predictionValue}
                  onChange={handlePredictionChange}
                  activeButtonStyle={activeButtonStyle}
                  inactiveButtonStyle={inactiveButtonStyle}
                />
              </div>
              <div>
                <p className="text-base text-foreground">
                  Submit a prediction and we&apos;ll record it on{' '}
                  <a href="https://base.org" className="underline">
                    Base
                  </a>
                  , a blockchain, connected to your Sapience account on
                  Ethereum.
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="ml-1 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto"
                        aria-label="Information about Sapience account connection"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Info size={14} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-52 p-2 text-sm">
                      By submitting, you cryptographically sign the prediction
                      and we pay the network fee to add your{' '}
                      <a
                        href="https://base.easscan.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        attestation
                      </a>{' '}
                      to the chain.
                    </PopoverContent>
                  </Popover>
                </p>
              </div>
            </div>
          )}

          {activeTab === 'wager' && (
            <div className="space-y-6">
              <div className="mt-1">
                <PredictionInput
                  market={{
                    optionNames: activeOptionNames,
                    baseTokenName:
                      marketData?.baseTokenName === null
                        ? undefined
                        : marketData?.baseTokenName,
                    quoteTokenName:
                      marketData?.quoteTokenName === null
                        ? undefined
                        : marketData?.quoteTokenName,
                    isGroupMarket,
                  }}
                  value={formData.predictionValue}
                  onChange={handlePredictionChange}
                  activeButtonStyle={activeButtonStyle}
                  inactiveButtonStyle={inactiveButtonStyle}
                />
              </div>
              <div>
                <div className="relative">
                  <Label htmlFor="wager-amount-input" className="sr-only">
                    Wager Amount
                  </Label>
                  <Input
                    id="wager-amount-input"
                    name="wagerAmount"
                    type="number"
                    className="w-full p-2 border rounded pr-24"
                    value={formData.wagerAmount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        wagerAmount: e.target.value,
                      })
                    }
                    placeholder="Enter amount"
                    aria-labelledby="wager-amount-label" // Keep this if label exists elsewhere or add visible label
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
                    sUSDS
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer pointer-events-auto" // Make button clickable
                          aria-label="Information about sUSDS"
                          onClick={(e) => e.stopPropagation()} // Prevent popover click from submitting form maybe?
                        >
                          <HelpCircle size={16} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        className="w-[200px] p-3 text-sm"
                      >
                        <p>
                          sUSDS is the yield-bearing token of the{' '}
                          <a
                            href="https://sky.money/features#savings"
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Sky Protocol
                          </a>
                          .
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                  {/* Conditional display based on quoter state */}
                  {quoteData && !isQuoteLoading && !quoteError && (
                    <>
                      {/* Display detailed quote info */}
                      <p>
                        Quoted Max Position Size ({quoteData.direction}):{' '}
                        <span className="font-medium">
                          {/* Assuming maxSize is BigInt string with 18 decimals, show absolute value */}
                          {formatUnits(
                            BigInt(
                              quoteData.maxSize.startsWith('-')
                                ? quoteData.maxSize.substring(1)
                                : quoteData.maxSize
                            ),
                            18
                          )}
                        </span>
                        <br />
                        (Based on current price:{' '}
                        {Number(quoteData.currentPrice).toFixed(4)} and expected
                        price: {Number(quoteData.expectedPrice).toFixed(4)})
                      </p>
                      {/* Display potential payout based on quote */}
                      <p>
                        If this market resolves to{' '}
                        <span className="italic">
                          {typeof formData.predictionValue === 'string'
                            ? formData.predictionValue.charAt(0).toUpperCase() +
                              formData.predictionValue.slice(1)
                            : formData.predictionValue}
                        </span>
                        , you will be able to redeem approximately{' '}
                        <span className="font-medium">
                          {/* Use formatted maxSize from quote data for payout */}
                          {formatUnits(
                            BigInt(
                              quoteData.maxSize.startsWith('-')
                                ? quoteData.maxSize.substring(1) // Use absolute value
                                : quoteData.maxSize
                            ),
                            18
                          )}{' '}
                          sUSDS
                        </span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="ml-1 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto"
                              aria-label="Information about payout"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Info size={14} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            className="w-52 p-2 text-sm"
                          >
                            The prediction market runs onchain using the open
                            source{' '}
                            <a
                              href="https://docs.foil.xyz"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              Foil Protocol
                            </a>
                            . Payout is based on the quoted position size for
                            your wager amount and predicted price.
                          </PopoverContent>
                        </Popover>
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Display attestation status */}
      {activeTab === 'predict' && attestationError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{attestationError}</AlertDescription>
        </Alert>
      )}

      {activeTab === 'predict' && attestationSuccess && (
        <Alert className="mb-4">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{attestationSuccess}</AlertDescription>
        </Alert>
      )}

      <div>
        {!isPermitLoadingPermit &&
          permitData?.permitted === false &&
          activeTab === 'wager' && (
            <Alert
              variant="destructive"
              className="mb-4 bg-destructive/10 rounded-sm"
            >
              <AlertTitle>Accessing Via Prohibited Region</AlertTitle>
              <AlertDescription>
                You cannot wager using this app.
              </AlertDescription>
            </Alert>
          )}
        <Button
          type="submit"
          disabled={
            isAttesting ||
            isPermitLoadingPermit ||
            (activeTab === 'wager' && permitData?.permitted === false) ||
            (activeTab === 'predict' && submissionValue === 'N/A')
          }
          className="w-full bg-primary text-primary-foreground py-6 px-5 rounded text-lg font-normal hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(() => {
            if (isAttesting) return 'Submitting...';
            // Conditionally disable button text change if submissionValue is N/A
            if (activeTab === 'predict' && submissionValue === 'N/A') {
              return 'Enter Prediction Above';
            }
            return activeTab === 'wager' ? 'Submit Wager' : 'Submit Prediction';
          })()}
        </Button>
      </div>
    </form>
  );
};

export default PredictionForm;

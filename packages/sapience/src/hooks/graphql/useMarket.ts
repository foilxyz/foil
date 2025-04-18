import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { useEffect, useState } from 'react';

import { foilApi } from '~/lib/utils/util';

// Updated query to fetch the specific market directly, filtered by chainId and marketGroup address
const MARKET_QUERY = gql`
  query GetMarketData($chainId: Int!, $address: String!, $marketId: Int!) {
    markets(chainId: $chainId, marketAddress: $address, marketId: $marketId) {
      id
      marketId
      question
      startTimestamp
      endTimestamp
      settled
      marketGroup {
        id
        address
        chainId
        question
        baseTokenName
        quoteTokenName
        optionNames
      }
    }
  }
`;

// Helper function to get chainId from chain short name
const getChainIdFromShortName = (shortName: string): number => {
  switch (shortName.toLowerCase()) {
    case 'base':
      return 8453;
    case 'arbitrum':
      return 42161;
    case 'ethereum':
    case 'mainnet':
      return 1;
    default:
      // Consider throwing an error or returning a specific value for unknown chains
      console.warn(`Unknown chain short name: ${shortName}`);
      return 0;
  }
};

// Helper function to format and set the question
const formatQuestion = (rawQuestion: string | undefined | null): string => {
  if (!rawQuestion) {
    return 'Market question not available';
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

interface UseMarketProps {
  chainShortName: string;
  marketId: string;
}

export const useMarket = ({ chainShortName, marketId }: UseMarketProps) => {
  const [displayQuestion, setDisplayQuestion] = useState('Loading question...');
  const [marketQuestionDisplay, setMarketQuestionDisplay] = useState<
    string | null
  >(null);

  // Parse chain and market address from chainShortName
  const decodedParam = decodeURIComponent(chainShortName);
  let marketAddress = '';
  let chainId = 0;

  if (decodedParam.includes(':')) {
    const [parsedChain, parsedAddress] = decodedParam.split(':');
    chainId = getChainIdFromShortName(parsedChain);
    marketAddress = parsedAddress;
  } else {
    // Assuming the address is directly provided if no chain prefix
    marketAddress = decodedParam;
    // Default to base if no chain is specified - consider making this configurable or required
    chainId = getChainIdFromShortName('base');
  }

  const numericMarketId = Number(marketId);

  const { data: marketData, isLoading: isLoadingMarket } = useQuery({
    queryKey: ['market', chainId, marketAddress, numericMarketId],
    queryFn: async () => {
      if (!chainId || !numericMarketId || !marketAddress) {
        console.log('Missing required parameters for market query:', {
          chainId,
          marketAddress,
          marketId: numericMarketId,
        });
        // Returning null or a specific error state might be better than placeholder
        return null; // Changed from { placeholder: true }
      }

      try {
        console.log('Fetching market with:', {
          chainId,
          address: marketAddress,
          marketId: numericMarketId,
        });

        const response = await foilApi.post('/graphql', {
          query: print(MARKET_QUERY),
          variables: {
            chainId,
            address: marketAddress,
            marketId: numericMarketId,
          },
        });

        console.log(
          'GraphQL response:',
          JSON.stringify(response.data, null, 2)
        );

        // The response structure might return an array or a single object depending on the query
        // Adapting based on the provided query which filters by marketId server-side
        const marketsData = response.data?.markets; // Corrected access path

        if (!marketsData) {
          console.error('No market data in response:', response.data);
          return null;
        }

        // Assuming the query correctly returns only the specific market when marketId is provided
        // If it still returns an array, you might need to find the market like before:
        // const targetMarket = Array.isArray(marketsData) ? marketsData.find(...) : marketsData;
        // For now, assuming the API returns the single expected market object or null/empty array
        if (Array.isArray(marketsData) && marketsData.length === 0) {
          console.error(
            `Market with ID ${numericMarketId} not found in response:`,
            marketsData
          );
          return null;
        }

        const targetMarket = Array.isArray(marketsData)
          ? marketsData[0]
          : marketsData;

        if (!targetMarket) {
          console.error(
            `Market data structure unexpected or empty for ID ${numericMarketId}:`,
            marketsData
          );
          return null;
        }

        return targetMarket;
      } catch (error) {
        console.error('Error fetching market:', error);
        // Propagate error state or return null
        return null; // Consider returning an error object
      }
    },
    enabled: !!chainId && !!numericMarketId && !!marketAddress,
    retry: 3,
    retryDelay: 1000,
  });

  // Process and format the question
  useEffect(() => {
    console.log('useMarket useEffect - isLoadingMarket:', isLoadingMarket); // Log loading state
    if (isLoadingMarket) {
      setDisplayQuestion('Loading question...');
      setMarketQuestionDisplay(null);
      return;
    }

    console.log('useMarket useEffect - marketData (raw):', marketData); // Log raw data before stringify

    if (!marketData) {
      console.log('useMarket useEffect - No marketData found.'); // Log if data is missing
      setDisplayQuestion('Market data not available.');
      setMarketQuestionDisplay(null);
      return;
    }

    console.log(
      'useMarket useEffect - Market data received:', // Keep existing log
      JSON.stringify(marketData, null, 2)
    );

    const marketGroupQuestion = marketData?.marketGroup?.question;
    const marketSpecificQuestion = marketData?.question;

    console.log(
      'useMarket useEffect - Market Group Question:',
      marketGroupQuestion
    ); // Log group question
    console.log(
      'useMarket useEffect - Market Specific Question:',
      marketSpecificQuestion
    ); // Log specific question

    // Set Market Group Question as the context question if available
    if (marketGroupQuestion) {
      setMarketQuestionDisplay(formatQuestion(marketGroupQuestion));
      console.log(
        'useMarket useEffect - Setting marketQuestionDisplay with:',
        formatQuestion(marketGroupQuestion)
      ); // Log what's being set
    } else {
      setMarketQuestionDisplay(null);
      console.log(
        'useMarket useEffect - Setting marketQuestionDisplay to null.'
      ); // Log null setting
    }

    // Determine the main display question
    const mainQuestionSource = marketSpecificQuestion || marketGroupQuestion;
    const formattedMainQuestion = formatQuestion(mainQuestionSource);
    setDisplayQuestion(formattedMainQuestion);
    console.log(
      'useMarket useEffect - Setting displayQuestion with:',
      formattedMainQuestion
    ); // Log what's being set
  }, [marketData, isLoadingMarket]);

  return {
    marketData,
    isLoadingMarket,
    displayQuestion,
    marketQuestionDisplay,
    chainId,
    marketAddress,
    numericMarketId,
  };
};

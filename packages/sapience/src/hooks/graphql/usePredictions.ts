import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { getAddress } from 'viem';

import { SCHEMA_UID } from '../../lib/constants/eas';

// Type for the raw data fetched from the API
interface RawAttestation {
  id: string;
  decodedDataJson: string;
  attester: string;
  recipient: string;
  time: number; // API returns time as a number (Unix timestamp)
}

// Parameterized version of the query
const GET_ATTESTATIONS_QUERY = "HA-HA! (in Nelson's voice)";

// const GET_ATTESTATIONS_QUERY = /* GraphQL */ `
//   query FindAttestations(
//     $schemaId: String!
//     $take: Int!
//     $marketAddress: String
//     $attesterAddress: String
//   ) {
//     attestations(
//       where: {
//         schemaId: { equals: $schemaId }
//         AND: [
//           { decodedDataJson: { contains: $marketAddress } }
//           { attester: { equals: $attesterAddress } }
//         ]
//       }
//       orderBy: { time: desc }
//       take: $take
//     ) {
//       id
//       decodedDataJson
//       attester
//       recipient
//       time
//     }
//   }
// `;

// Type definition for GraphQL response
type AttestationsQueryResponse = {
  attestations: RawAttestation[];
};

export interface DecodedField {
  name: string;
  value:
    | {
        value?: {
          hex?: string;
        };
      }
    | string
    | number;
}

// Define the data type for the formatted attestation record used in the table
export type FormattedAttestation = {
  id: string;
  attester: string;
  shortAttester: string;
  value: string;
  time: string; // Formatted time string
  rawTime: number; // Original timestamp
  decodedData: DecodedField[];
};

// Helper function to parse the JSON string in decodedDataJson
const parseDecodedData = (decodedDataJson: string): DecodedField[] => {
  try {
    return JSON.parse(decodedDataJson);
  } catch (e) {
    console.error('Failed to parse decodedDataJson:', e);
    return [];
  }
};

// Helper function to extract prediction value from decoded data
export const extractPredictionValue = (
  decodedData: DecodedField[]
): string | null => {
  const predictionField = decodedData.find(
    (field) => field.name === 'prediction'
  );

  if (!predictionField?.value) {
    return null;
  }

  if (typeof predictionField.value === 'number') {
    return predictionField.value.toString();
  }

  if (typeof predictionField.value === 'string') {
    try {
      return predictionField.value;
    } catch (e) {
      console.error('Failed to parse prediction string:', e);
    }
  }

  if (
    typeof predictionField.value === 'object' &&
    predictionField.value.value?.hex
  ) {
    try {
      // Convert hex value to a number
      const hexValue = predictionField.value.value.hex;
      const numericValue = parseInt(hexValue, 16);
      return numericValue.toString();
    } catch (e) {
      console.error('Failed to parse prediction hex:', e);
    }
  }

  return null;
};

// Helper function to extract market ID from decoded data
export const extractMarketId = (decodedData: DecodedField[]): number | null => {
  const marketIdField = decodedData.find((field) => field.name === 'marketId');

  if (marketIdField?.value) {
    if (typeof marketIdField.value === 'number') {
      return marketIdField.value;
    }
    if (
      typeof marketIdField.value === 'object' &&
      marketIdField.value.value?.hex
    ) {
      try {
        return parseInt(marketIdField.value.value.hex, 16);
      } catch (e) {
        console.error('Failed to parse marketId hex:', e);
      }
    } else if (typeof marketIdField.value === 'string') {
      try {
        return parseInt(marketIdField.value, 10);
      } catch (e) {
        console.error('Failed to parse marketId string:', e);
      }
    }
  }
  return null;
};

// Helper function to extract prediction value based on sqrtPriceX96
const extractSqrtPricePrediction = (predictionField: DecodedField): string => {
  if (
    typeof predictionField.value === 'object' &&
    predictionField.value.value?.hex
  ) {
    const { hex } = predictionField.value.value;
    try {
      const sqrtPriceX96 = BigInt(hex);
      const price = Number(
        (sqrtPriceX96 * sqrtPriceX96) /
          BigInt(
            '6277101735386680763835789423207666416102355444464034512896' // 2^192
          )
      );

      if (price === 0) return '0';
      if (price % 1 === 0) return price.toString();
      return Number.parseFloat(price.toFixed(4)).toString();
    } catch (e) {
      console.error('Failed to parse hex value:', e);
      return hex; // Fallback to showing the hex
    }
  } else if (
    typeof predictionField.value === 'object' &&
    predictionField.value.value
  ) {
    return String(predictionField.value.value);
  }
  return 'Unknown';
};

// Helper function to determine the final prediction value string
const getPredictionDisplayValue = (
  decodedData: DecodedField[],
  optionNames?: string[]
): string => {
  const marketId = extractMarketId(decodedData);

  // Prioritize optionNames based on marketId if available
  if (marketId !== null && optionNames && optionNames[marketId - 1]) {
    // Adjust marketId (often 1-based) to 0-based index
    return optionNames[marketId - 1];
  }

  // Fallback to 'prediction' field if marketId doesn't yield a result
  const predictionField = decodedData.find(
    (field) => field.name === 'prediction'
  );
  if (predictionField) {
    return extractSqrtPricePrediction(predictionField);
  }

  return 'Unknown'; // Default fallback
};

// Format raw attestation data into a displayable format
const formatAttestationData = (
  attestation: RawAttestation,
  optionNames?: string[]
): FormattedAttestation => {
  try {
    const decodedData = parseDecodedData(attestation.decodedDataJson);
    const predictionValue = getPredictionDisplayValue(decodedData, optionNames);
    const formattedTime = new Date(
      Number(attestation.time) * 1000
    ).toLocaleString();

    return {
      id: attestation.id,
      attester: attestation.attester,
      shortAttester: `${attestation.attester.slice(0, 6)}...${attestation.attester.slice(-4)}`,
      value: predictionValue,
      time: formattedTime,
      rawTime: attestation.time,
      decodedData,
    };
  } catch (err) {
    console.error('Error processing attestation data:', err);
    return {
      id: attestation.id,
      attester: attestation.attester,
      shortAttester: `${attestation.attester.slice(0, 6)}...${attestation.attester.slice(-4)}`,
      value: 'Error processing data',
      time: new Date(Number(attestation.time) * 1000).toLocaleString(),
      rawTime: attestation.time,
      decodedData: [],
    };
  }
};

interface UsePredictionsProps {
  marketAddress?: string;
  schemaId?: string;
  optionNames?: string[];
  attesterAddress?: string;
  chainId?: number;
  marketId?: number;
}

export const usePredictions = ({
  marketAddress,
  schemaId = SCHEMA_UID,
  optionNames,
  attesterAddress,
  chainId,
  marketId,
}: UsePredictionsProps) => {
  const {
    data: attestationsData,
    isLoading,
    error,
    refetch,
  } = useQuery<AttestationsQueryResponse | undefined>({
    queryKey: [
      'attestations',
      schemaId,
      marketAddress,
      attesterAddress,
      chainId,
      marketId,
    ],
    queryFn: async () => {
      // Normalize addresses if provided
      let normalizedMarketAddress = marketAddress;
      if (marketAddress) {
        try {
          normalizedMarketAddress = getAddress(marketAddress);
        } catch (e) {
          console.error('Failed to normalize market address:', e);
          // Fallback to the original address
        }
      }

      let normalizedAttesterAddress = attesterAddress;
      if (attesterAddress) {
        try {
          normalizedAttesterAddress = getAddress(attesterAddress);
        } catch (e) {
          console.error('Failed to normalize attester address:', e);
          // Fallback to the original address
        }
      }

      // Prepare variables, omitting undefined ones
      const variables: Record<string, string | number> = {
        schemaId,
        take: 10, // Consider making 'take' a parameter if needed
      };
      if (normalizedMarketAddress) {
        variables.marketAddress = normalizedMarketAddress;
      }
      if (normalizedAttesterAddress) {
        variables.attesterAddress = normalizedAttesterAddress;
      }

      // Make the request to the external EAS GraphQL API
      const response = await fetch('https://base.easscan.org/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: GET_ATTESTATIONS_QUERY,
          variables,
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const result = await response.json();

      // Check if we have data in the expected structure
      if (result.data?.attestations) {
        return result.data;
      }
      console.error('Unexpected response structure:', result);
      throw new Error('Failed to load predictions');
    },
    enabled: Boolean(schemaId && (marketAddress || attesterAddress)),
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 4000, // Refetch every 4 seconds
  });

  // Transform raw attestations data into the proper format for the table
  const data: FormattedAttestation[] = React.useMemo(() => {
    if (!attestationsData?.attestations) return [];

    let formatted = attestationsData.attestations.map((att: RawAttestation) =>
      formatAttestationData(att, optionNames)
    );

    // Filter by marketId if provided
    if (marketId !== undefined) {
      formatted = formatted.filter((attestation) => {
        const attMarketId = extractMarketId(attestation.decodedData);
        return attMarketId === marketId;
      });
    }

    return formatted;
  }, [attestationsData, optionNames, marketId]); // Added marketId to dependency array

  return { data, isLoading, error, refetch };
};

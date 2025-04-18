'use client';

import Link from 'next/link';
import * as React from 'react';
import * as chains from 'viem/chains';

import {
  findActiveMarkets,
  getDisplayQuestion,
} from '~/lib/utils/questionUtils';

// Update MarketGroupPreviewProps to accept displayQuestion
export interface MarketGroupPreviewProps {
  chainId: number;
  marketAddress: string;
  epochs: any[]; // Consider using EpochWithMarketInfo[] from MarketGroupsList if exported
  color: string;
  displayQuestion?: string; // Optional provided question
  marketData?: any; // Add optional market data for calculating the question
}

export const MarketGroupPreview = ({
  chainId,
  marketAddress,
  epochs,
  color,
  displayQuestion: providedDisplayQuestion,
  marketData,
}: MarketGroupPreviewProps) => {
  // Get chain short name for the URL
  const chainShortName = React.useMemo(
    () => getChainShortName(chainId),
    [chainId]
  );

  // Calculate display question - prioritize market data calculation
  const finalDisplayQuestion = React.useMemo(() => {
    if (marketData) {
      // Find active epochs if market data is available
      const activeEpochs = findActiveMarkets(marketData);
      // Use shared logic to determine question
      return getDisplayQuestion(marketData, activeEpochs, false);
    }
    // Fallback to provided display question
    return providedDisplayQuestion || 'Market question not available';
  }, [marketData, providedDisplayQuestion]);

  // Early return if no epochs
  if (!epochs || epochs.length === 0) {
    return null;
  }

  return (
    <Link href={`/forecasting/${chainShortName}:${marketAddress}`}>
      <div className="bg-background border-b border-muted dark:bg-muted/50 flex hover:bg-secondary/10 transition-colors">
        <div
          className="w-1 min-w-[4px] max-w-[4px] -translate-y-[1px]"
          style={{
            backgroundColor: color,
            margin: '-1px 0',
            alignSelf: 'stretch',
          }}
        />
        <div className="px-4 py-3">
          <h3 className="text-xl font-heading font-normal">
            {finalDisplayQuestion}
          </h3>
        </div>
      </div>
    </Link>
  );
};

// Helper function to get chain short name from chainId
const getChainShortName = (id: number): string => {
  const chainObj = Object.values(chains).find((chain) => chain.id === id);
  return chainObj
    ? chainObj.name.toLowerCase().replace(/\s+/g, '')
    : id.toString();
};

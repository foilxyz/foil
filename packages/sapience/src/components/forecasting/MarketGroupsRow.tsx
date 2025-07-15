'use client';

import Link from 'next/link';
import * as React from 'react';

import type { MarketWithContext } from './MarketGroupsList';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { getChainShortName } from '~/lib/utils/util';

// Import the shared type

export interface MarketGroupsRowProps {
  chainId: number;
  marketAddress: string;
  market: MarketWithContext[];
  color: string;
  displayQuestion: string;
  isActive?: boolean;
  marketClassification?: MarketGroupClassification;
  displayUnit?: string;
}

const MarketGroupsRow = ({
  chainId,
  marketAddress,
  market,
  color,
  displayQuestion,
  isActive,
  marketClassification,
  displayUnit,
}: MarketGroupsRowProps) => {
  const chainShortName = React.useMemo(
    () => getChainShortName(chainId),
    [chainId]
  );

  const highestPricedMarketOption = React.useMemo(() => {
    if (
      !isActive ||
      marketClassification !== MarketGroupClassificationEnum.MULTIPLE_CHOICE ||
      market.length === 0
    )
      return null;

    let optionNameWithHighestPrice: string | null | undefined = null;

    market.forEach((marketItem) => {
      // TODO: Get actual current price from market data
      // For now, just return the first market's option name
      if (optionNameWithHighestPrice === null) {
        optionNameWithHighestPrice = marketItem.optionName;
      }
    });
    return optionNameWithHighestPrice;
  }, [isActive, marketClassification, market]);

  const yesNoPredictionPercentage = React.useMemo(() => {
    if (
      !isActive ||
      marketClassification !== MarketGroupClassificationEnum.YES_NO ||
      market.length === 0
    )
      return null;

    let targetMarket = market.find((m) => m.optionName === 'Yes');
    if (!targetMarket && market.length > 0) [targetMarket] = market;

    if (targetMarket) {
      // TODO: Get actual market price from targetMarket data
      // For now, return null until market price data is available
      return null;
    }
    return null;
  }, [isActive, marketClassification, market]);

  const numericFormattedPriceDisplay = React.useMemo(() => {
    if (
      !isActive ||
      market.length === 0 ||
      marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE ||
      marketClassification === MarketGroupClassificationEnum.YES_NO
    ) {
      return null;
    }
    // TODO: Implement actual market price retrieval
    // For now, return null until market price data is available
    return null;
  }, [isActive, marketClassification, market]);

  if (!market || market.length === 0) {
    return null;
  }

  const canShowPredictionElement =
    isActive &&
    ((marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE &&
      highestPricedMarketOption) ||
      (marketClassification === MarketGroupClassificationEnum.YES_NO &&
        yesNoPredictionPercentage) ||
      (marketClassification !== MarketGroupClassificationEnum.MULTIPLE_CHOICE &&
        marketClassification !== MarketGroupClassificationEnum.YES_NO &&
        numericFormattedPriceDisplay));

  let predictionContent;
  if (marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE) {
    predictionContent = highestPricedMarketOption;
  } else if (marketClassification === MarketGroupClassificationEnum.YES_NO) {
    predictionContent = yesNoPredictionPercentage;
  } else {
    predictionContent = (
      <>
        {numericFormattedPriceDisplay}
        {displayUnit &&
          marketClassification === MarketGroupClassificationEnum.NUMERIC && (
            <span className="ml-1">{displayUnit}</span>
          )}
      </>
    );
  }

  return (
    <Link href={`/forecasting/${chainShortName}:${marketAddress}`}>
      {/* Main Row Container for Color Bar + Content */}
      <div className="bg-background border-muted dark:bg-muted/50 flex flex-row hover:bg-secondary/20 transition-colors items-stretch min-h-[72px]">
        {/* Colored Bar (Full Height) */}
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: color, margin: '-1px 0' }}
        />

        {/* Content Container (stacks Question & Prediction on mobile, row on desktop) */}
        <div className="flex-grow flex flex-col lg:flex-row lg:items-center px-5 py-3">
          {/* Question Section */}
          <div className="pb-3 lg:pb-0 lg:pr-5">
            <h3 className="text-xl font-heading font-normal">
              {displayQuestion}
            </h3>
          </div>

          {/* Prediction Section (conditionally rendered) */}
          {canShowPredictionElement && (
            // This div handles the responsive line *within* the prediction block
            <div className="text-sm text-muted-foreground w-full lg:w-auto flex flex-col lg:flex-row lg:items-center lg:ml-auto lg:min-w-[280px]">
              {/* Responsive Gray Line (internal to prediction block) */}
              <div className="bg-border w-full h-px mb-1 lg:w-px lg:h-auto lg:self-stretch lg:mr-5 lg:mb-0" />
              {/* Prediction Text Content */}
              <div className="mt-2 lg:mt-0">
                <div className="whitespace-nowrap">
                  Current Market Prediction
                </div>
                <div className="text-lg font-medium text-foreground">
                  {predictionContent}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default MarketGroupsRow;

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useMemo, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';

import type {
  MarketGroup as MarketGroupType,
  Market as MarketType,
} from '@sapience/ui/types/graphql';
import { useSapience } from '../../../lib/context/SapienceProvider';
import MarketGroupChart from '~/components/forecasting/MarketGroupChart';
import MarketGroupHeader from '~/components/forecasting/MarketGroupHeader';
import MarketStatusDisplay from '~/components/forecasting/MarketStatusDisplay';
import UserPositionsTable from '~/components/forecasting/UserPositionsTable';
import { usePositions } from '~/hooks/graphql/usePositions';
import {
  MarketGroupPageProvider,
  useMarketGroupPage,
} from '~/lib/context/MarketGroupPageProvider';
import type { MarketGroupClassification } from '~/lib/types';
import { formatQuestion, parseUrlParameter } from '~/lib/utils/util';

export type ActiveTab = 'predict' | 'wager';

// Dynamically import LottieLoader
const LottieLoader = dynamic(
  () => import('../../../components/shared/LottieLoader'),
  {
    ssr: false,
    // Use a simple div as placeholder during load
    loading: () => <div className="w-8 h-8" />,
  }
);

const DynamicPredictForm = dynamic(
  () =>
    import('~/components/forecasting/forms/PredictForm').then((mod) => ({
      default: mod.default,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center py-24 w-full">
        <LottieLoader width={32} height={32} />
      </div>
    ),
  }
);

const DynamicWagerFormFactory = dynamic(
  () =>
    import('~/components/forecasting/forms/WagerFormFactory').then((mod) => ({
      default: mod.default,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-8">
        <LottieLoader width={30} height={30} />
      </div>
    ),
  }
);

// Create a ForecastingForm component to handle the form rendering logic
const ForecastingForm = ({
  marketGroupData,
  marketClassification,
  permitData,
  onWagerSuccess,
  activeMarket,
}: {
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  permitData: { permitted: boolean };
  onWagerSuccess: (txnHash: string) => void;
  activeMarket?: MarketType;
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('wager');

  // Check if market is active (not expired or settled)
  const isActive = useMemo(() => {
    if (!activeMarket) {
      return false;
    }

    const isExpired =
      activeMarket.endTimestamp &&
      Date.now() > Number(activeMarket.endTimestamp) * 1000;

    return !isExpired;
  }, [activeMarket]);

  if (!isActive) {
    return (
      <MarketStatusDisplay
        marketGroupData={marketGroupData}
        marketClassification={marketClassification}
      />
    );
  }

  return (
    <div className="bg-card p-6 rounded shadow-sm border">
      <h2 className="text-3xl font-normal mb-4">Forecast</h2>
      {/* Tabs Section */}
      <div className="space-y-2 mt-4">
        <div className="flex w-full border-b">
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-base font-medium text-center ${
              activeTab === 'wager'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
            onClick={() => setActiveTab('wager')}
          >
            Wager
          </button>
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-base font-medium text-center ${
              activeTab === 'predict'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
            onClick={() => setActiveTab('predict')}
          >
            Predict
          </button>
        </div>

        {/* Form Content Based on Market Type */}
        <div className="pt-4">
          {/* Only render the active form component */}
          {activeTab === 'predict' ? (
            <DynamicPredictForm
              marketGroupData={marketGroupData}
              marketClassification={marketClassification}
              chainId={marketGroupData.chainId}
            />
          ) : (
            <DynamicWagerFormFactory
              marketClassification={marketClassification}
              marketGroupData={marketGroupData}
              isPermitted={!!permitData?.permitted}
              onSuccess={onWagerSuccess}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const MarketGroupPageContent = () => {
  const { address } = useAccount();
  const params = useParams();
  const pathname = usePathname();
  const { permitData, isPermitLoading: isPermitLoadingPermit } = useSapience();
  const [showMarketSelector, setShowMarketSelector] = useState(false);

  // Local trigger that will be bumped whenever the user submits a new wager
  const [userPositionsTrigger, setUserPositionsTrigger] = useState(0);

  const handleUserPositionsRefetch = useCallback(() => {
    setUserPositionsTrigger((prev) => prev + 1);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refetchUserPositions = useCallback(() => {}, [userPositionsTrigger]);

  // Parse chain and market address from URL parameter
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  const {
    marketGroupData,
    isLoading,
    isSuccess,
    activeMarkets,
    marketClassification,
    chainId,
  } = useMarketGroupPage();

  const { isLoading: isUserPositionsLoading } = usePositions({
    address: address || '',
    marketAddress,
  });

  // If loading, show the Lottie loader
  if (isLoading || isPermitLoadingPermit) {
    return (
      <div className="flex flex-col w-full min-h-[100dvh] items-center justify-center">
        <LottieLoader />
      </div>
    );
  }

  // If error or no data, show error screen
  if (!isSuccess || !marketGroupData) {
    return (
      <div className="flex flex-col w-full min-h-[100dvh] items-center justify-center p-4">
        <h2 className="text-2xl font-medium mb-4">
          Unable to load market data
        </h2>
        <p className="text-muted-foreground">
          Please try again later or check your connection.
        </p>
      </div>
    );
  }

  const optionNames = (marketGroupData.markets || []).map(
    (market: MarketType) => market.optionName || ''
  );

  // Find the active market once
  const activeMarket =
    activeMarkets.find((market) => market.poolAddress === marketAddress) ||
    activeMarkets[0];

  // Otherwise show the main content
  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden pt-28 pb-40 lg:pt-32 lg:pb-12">
      <div className="container mx-auto max-w-4xl flex flex-col">
        <MarketGroupHeader
          marketGroupData={marketGroupData}
          activeMarket={activeMarket}
          chainId={chainId}
          marketClassification={marketClassification}
          chainShortName={chainShortName}
        />

        {/* Main content layout: Apply gap-6 and px-3 from user example */}
        <div className="flex flex-col gap-6 px-3">
          {/* Row 1: Chart/List + Form */}
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Left Column (Chart/List) */}
            <div className="flex flex-col w-full md:flex-1">
              <div className="border border-border rounded flex flex-col flex-1 shadow-sm">
                <div className="flex-1 min-h-[400px]">
                  <MarketGroupChart
                    chainShortName={chainShortName}
                    marketAddress={marketAddress}
                    marketIds={activeMarkets.map((market) =>
                      Number(market.marketId)
                    )}
                    market={marketGroupData}
                    minTimestamp={
                      activeMarkets.length > 0
                        ? Math.min(
                            ...activeMarkets.map((market) =>
                              Number(market.startTimestamp)
                            )
                          )
                        : undefined
                    }
                    optionNames={optionNames}
                  />
                </div>
              </div>
            </div>

            {/* Form (Right Column) */}
            <div className="w-full lg:w-[340px]">
              <ForecastingForm
                marketGroupData={marketGroupData}
                marketClassification={marketClassification!}
                permitData={permitData!}
                onWagerSuccess={handleUserPositionsRefetch}
                activeMarket={activeMarket}
              />
            </div>
          </div>

          {/* Row 2: Dropdown and Advanced View */}
          <div className="flex justify-between items-center">
            <div>{/* placeholder */}</div>
            {/* Advanced View button (Right Aligned) */}
            <div>
              <button
                type="button"
                onClick={() => setShowMarketSelector(true)}
                className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold"
              >
                ADVANCED VIEW
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Row 3: User Positions Table */}
          {(() => {
            if (!address) {
              return null;
            }
            if (isUserPositionsLoading) {
              return (
                <div className="mt-6 text-center p-6 border border-muted rounded bg-background/50">
                  <div className="flex flex-col items-center justify-center py-2">
                    <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Loading your positions...
                    </p>
                  </div>
                </div>
              );
            }
            return (
              <div>
                <UserPositionsTable
                  account={address}
                  marketAddress={marketAddress}
                  chainId={chainId}
                  refetchUserPositions={refetchUserPositions}
                />
              </div>
            );
          })()}
        </div>
      </div>

      {/* Market Selection Dialog */}
      <Dialog open={showMarketSelector} onOpenChange={setShowMarketSelector}>
        <DialogContent className="sm:max-w-xl [&>[aria-label='Close']]:hidden p-8">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-3xl font-normal">
              Prediction Markets
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pb-2">
            {(() => {
              // Categorize markets into active and past
              const allMarkets = marketGroupData.markets || [];
              const currentTime = Date.now();

              const activeMarketsList = allMarkets.filter(
                (market: MarketType) => {
                  const isExpired =
                    market.endTimestamp &&
                    currentTime > Number(market.endTimestamp) * 1000;
                  return !isExpired;
                }
              );

              const pastMarketsList = allMarkets.filter(
                (market: MarketType) => {
                  return (
                    market.endTimestamp &&
                    currentTime > Number(market.endTimestamp) * 1000
                  );
                }
              );

              return (
                <>
                  {/* Active Markets Section */}
                  {activeMarketsList.length > 0 && (
                    <div>
                      <h3 className="font-medium text-sm text-muted-foreground mb-2">
                        Active Markets
                      </h3>
                      <div className="border border-muted rounded shadow-sm bg-background/50 overflow-hidden">
                        {activeMarketsList.map((market: MarketType) => (
                          <Link
                            key={market.id}
                            href={`${pathname}/${market.marketId}`}
                            onClick={() => setShowMarketSelector(false)}
                          >
                            <div className="bg-background border-muted dark:bg-muted/50 flex flex-row hover:bg-secondary/20 transition-colors items-stretch min-h-[72px] border-b last:border-b-0 border-border">
                              {/* Colored Bar (Full Height) */}
                              <div
                                className="w-1 min-w-[4px] max-w-[4px]"
                                style={{
                                  backgroundColor: '#3B82F6',
                                  margin: '-1px 0',
                                }}
                              />

                              {/* Content Container */}
                              <div className="flex-grow flex flex-col lg:flex-row lg:items-center px-5 py-3">
                                {/* Question Section */}
                                <div className="pb-3 lg:pb-0 lg:pr-5">
                                  <h3 className="text-xl font-heading font-normal">
                                    {market.question
                                      ? formatQuestion(market.question)
                                      : `Market ${market.marketId}`}
                                  </h3>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Past Markets Section */}
                  {pastMarketsList.length > 0 && (
                    <div>
                      <h3 className="font-medium text-sm text-muted-foreground mb-2">
                        Past Markets
                      </h3>
                      <div className="border border-muted rounded shadow-sm bg-background/50 overflow-hidden">
                        {pastMarketsList.map((market: MarketType) => (
                          <Link
                            key={market.id}
                            href={`${pathname}/${market.marketId}`}
                            onClick={() => setShowMarketSelector(false)}
                          >
                            <div className="bg-background border-muted dark:bg-muted/50 flex flex-row hover:bg-secondary/20 transition-colors items-stretch min-h-[72px] border-b last:border-b-0 border-border opacity-75">
                              {/* Colored Bar (Full Height) */}
                              <div
                                className="w-1 min-w-[4px] max-w-[4px]"
                                style={{
                                  backgroundColor: '#71717a',
                                  margin: '-1px 0',
                                }}
                              />

                              {/* Content Container */}
                              <div className="flex-grow flex flex-col lg:flex-row lg:items-center px-5 py-3">
                                {/* Question Section */}
                                <div className="pb-3 lg:pb-0 lg:pr-5">
                                  <h3 className="text-xl font-heading font-normal">
                                    {market.question
                                      ? formatQuestion(market.question)
                                      : `Market ${market.marketId}`}
                                  </h3>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MarketGroupPage = () => {
  const params = useParams();
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  return (
    <MarketGroupPageProvider pageDetails={{ chainShortName, marketAddress }}>
      <MarketGroupPageContent />
    </MarketGroupPageProvider>
  );
};

export default MarketGroupPage;

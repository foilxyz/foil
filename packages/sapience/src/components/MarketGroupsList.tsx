'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@foil/ui/components/ui/sheet';
import { Skeleton } from '@foil/ui/components/ui/skeleton';
import { useIsMobile } from '@foil/ui/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FrownIcon,
  LayoutGridIcon,
  TagIcon,
  SlidersHorizontal,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { FOCUS_AREAS, type FocusArea } from '~/lib/constants/focusAreas';
import {
  useEnrichedMarkets,
  useCategories,
  type Epoch,
} from '~/lib/hooks/useMarketGroups';

import { MarketGroupPreview } from './MarketGroupPreview';

// Constants for button classes
const selectedStatusClass = 'bg-secondary';
const hoverStatusClass = 'hover:bg-secondary/50';
const DEFAULT_CATEGORY_COLOR = '#71717a';

// Define local interfaces based on expected data shape
interface EpochWithContext extends Epoch {
  marketAddress: string;
  chainId: number;
  collateralAsset: string;
  isYin: boolean;
  categorySlug: string;
  categoryId: string;
}

// Interface for the final grouped market data structure
interface GroupedMarket {
  key: string;
  marketAddress: string;
  chainId: number;
  marketName: string;
  collateralAsset: string;
  color: string;
  categorySlug: string;
  categoryId: string;
  isYin: boolean;
  marketQuestion?: string | null;
  epochs: EpochWithContext[];
  displayQuestion?: string;
}

// Define FocusAreaFilter component outside ForecastingTable
const FocusAreaFilter = ({
  selectedCategorySlug,
  handleCategoryClick,
  statusFilter,
  handleStatusFilterClick,
  isLoadingCategories,
  categories,
  getCategoryStyle,
}: {
  selectedCategorySlug: string | null;
  handleCategoryClick: (categorySlug: string | null) => void;
  statusFilter: 'all' | 'active';
  handleStatusFilterClick: (filter: 'all' | 'active') => void;
  isLoadingCategories: boolean;
  categories: any[] | null | undefined;
  getCategoryStyle: (categorySlug: string) => FocusArea | undefined;
}) => (
  <div className="p-5 w-[280px] mt-0">
    <div className="pb-2">
      <h3 className="font-medium text-sm mb-3">Focus Areas</h3>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => handleCategoryClick(null)}
          className={`inline-flex text-left px-2 pr-4 py-1.5 rounded-full items-center gap-2 transition-colors text-xs ${selectedCategorySlug === null ? selectedStatusClass : hoverStatusClass}`}
        >
          <div className="rounded-full p-1 w-7 h-7 flex items-center justify-center bg-zinc-500/20">
            <LayoutGridIcon className="w-3 h-3 text-zinc-500" />
          </div>
          <span className="font-medium">All Focus Areas</span>
        </button>
        {isLoadingCategories &&
          [...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-full" />
          ))}
        {!isLoadingCategories &&
          categories &&
          categories.map((category) => {
            const styleInfo = getCategoryStyle(category.slug);
            const categoryColor = styleInfo?.color ?? DEFAULT_CATEGORY_COLOR;

            // Use the name from FOCUS_AREAS if available, otherwise fall back to category.name
            const displayName = styleInfo?.name || category.name;

            return (
              <button
                type="button"
                key={category.id}
                onClick={() => handleCategoryClick(category.slug)}
                className={`inline-flex text-left px-2 pr-4 py-1.5 rounded-full items-center gap-2 transition-colors text-xs ${selectedCategorySlug === category.slug ? selectedStatusClass : hoverStatusClass}`}
              >
                <div
                  className="rounded-full p-1 w-7 h-7 flex items-center justify-center"
                  style={{ backgroundColor: `${categoryColor}1A` }}
                >
                  {styleInfo?.iconSvg ? (
                    <div style={{ transform: 'scale(0.65)' }}>
                      <div
                        style={{ color: categoryColor }}
                        dangerouslySetInnerHTML={{
                          __html: styleInfo.iconSvg,
                        }}
                      />
                    </div>
                  ) : (
                    <TagIcon className="w-3 h-3" />
                  )}
                </div>
                <span className="font-medium">{displayName}</span>
              </button>
            );
          })}
      </div>

      <div className="mt-6 mb-6">
        <h3 className="font-medium text-sm mb-2">Status</h3>
        <div className="flex space-x-1">
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded-md ${statusFilter === 'active' ? selectedStatusClass : hoverStatusClass}`}
            onClick={() => handleStatusFilterClick('active')}
          >
            Active
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded-md ${statusFilter === 'all' ? selectedStatusClass : hoverStatusClass}`}
            onClick={() => handleStatusFilterClick('all')}
          >
            All
          </button>
        </div>
      </div>
    </div>
  </div>
);

const ForecastingTable = () => {
  // Use the new hook and update variable names
  const { data: enrichedMarkets, isLoading: isLoadingMarkets } =
    useEnrichedMarkets();
  const { data: categories, isLoading: isLoadingCategories } = useCategories();

  const searchParams = useSearchParams();
  const router = useRouter();

  // Get the category SLUG from the URL query parameter, default to null (all)
  const categorySlugParam = searchParams.get('category');
  const [selectedCategorySlug, setSelectedCategorySlug] = React.useState<
    string | null
  >(categorySlugParam);

  // Add state for the active/settled toggle
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active'>(
    'active'
  );

  // Add state for filter sheet
  const [filterOpen, setFilterOpen] = React.useState(false);
  // Get mobile status
  const isMobile = useIsMobile();

  // Update the state when the URL parameter changes
  React.useEffect(() => {
    const currentCategorySlug = searchParams.get('category');
    // Basic validation: just set if it exists or is null
    setSelectedCategorySlug(currentCategorySlug);
  }, [searchParams]);

  // --- Memoization Logic Refactoring ---
  // Log before memo calculation starts
  console.log('[Pre-Memo] enrichedMarkets raw data:', enrichedMarkets);
  const groupedMarkets: GroupedMarket[] = React.useMemo(() => {
    console.log('[Memo] Recalculating groupedMarkets...');
    console.log('[Memo] enrichedMarkets:', enrichedMarkets);
    console.log('[Memo] selectedCategorySlug:', selectedCategorySlug);

    if (!enrichedMarkets) return [];

    // 1. Filter enrichedMarkets by selected Category SLUG *before* flattening
    const filteredMarkets = enrichedMarkets.filter((market) => {
      if (selectedCategorySlug === null) return true; // Show all if no category selected

      // LOGGING the comparison
      const marketSlug = market.category?.slug;
      const comparisonResult = marketSlug === selectedCategorySlug;
      console.log(
        `[Filter] Comparing market slug: "${marketSlug}" === selected slug: "${selectedCategorySlug}" -> ${comparisonResult}`
      );

      // Filter based on the actual category slug
      return comparisonResult;
    });

    console.log(
      '[Memo] filteredMarkets length after category filter:',
      filteredMarkets.length
    );

    // 2. Map filteredMarkets to EpochWithContext[]
    const allEpochs: EpochWithContext[] = filteredMarkets.flatMap((market) =>
      market.epochs.map((epoch) => ({
        ...epoch, // Spread epoch details
        marketAddress: market.address,
        chainId: market.chainId,
        collateralAsset: market.collateralAsset,
        isYin: market.isYin,
        categorySlug: market.category.slug,
        categoryId: market.category.id,
      }))
    );

    // 3. Filter epochs based on status
    const now = Math.floor(Date.now() / 1000);
    const filteredEpochsByStatus: EpochWithContext[] = allEpochs.filter(
      (epoch) => {
        if (typeof epoch.endTimestamp !== 'number' || epoch.endTimestamp <= 0) {
          console.warn('Filtering out epoch with invalid endTimestamp:', epoch);
          return false;
        }
        if (!epoch.public) return false;
        if (statusFilter === 'active') {
          return now <= epoch.endTimestamp;
        }
        return true;
      }
    );

    // 4. Group filtered epochs by market key
    const groupedByMarketKey = filteredEpochsByStatus.reduce<{
      [key: string]: GroupedMarket;
    }>((acc, epoch) => {
      const marketKey = `${epoch.chainId}:${epoch.marketAddress}`;
      if (!acc[marketKey]) {
        // Find the corresponding enrichedMarket to get details
        const sourceMarket = filteredMarkets.find(
          (m) => `${m.chainId}:${m.address}` === marketKey
        );

        // Find the FocusArea data that includes this market's category slug
        const focusAreaStyle = FOCUS_AREAS.find(
          (fa) => fa.id === sourceMarket?.category?.slug
        );
        const color = focusAreaStyle?.color ?? DEFAULT_CATEGORY_COLOR;

        acc[marketKey] = {
          key: marketKey,
          marketAddress: epoch.marketAddress,
          chainId: epoch.chainId,
          marketName: sourceMarket?.category?.name ?? 'Market',
          collateralAsset: epoch.collateralAsset,
          color,
          categorySlug: epoch.categorySlug,
          categoryId: epoch.categoryId,
          isYin: epoch.isYin,
          marketQuestion: undefined,
          epochs: [],
          displayQuestion: undefined,
        };
      }
      acc[marketKey].epochs.push(epoch);
      return acc;
    }, {});

    // 5. Determine display question for each group and convert to array
    return Object.values(groupedByMarketKey).map((groupedMarket) => {
      let displayQuestion: string | null | undefined = null; // Start with null

      if (groupedMarket.epochs && groupedMarket.epochs.length > 0) {
        // Sort epochs by endTimestamp descending to get the most recent first
        const sortedEpochs = [...groupedMarket.epochs].sort(
          (a, b) => b.endTimestamp - a.endTimestamp
        );
        // Try to get the question from the most recent epoch
        displayQuestion = sortedEpochs[0]?.question;
      }

      // Fallback to market name (category name) if no epoch question was found
      displayQuestion = displayQuestion ?? groupedMarket.marketName;

      return {
        ...groupedMarket,
        displayQuestion: displayQuestion ?? undefined,
      };
    });
  }, [enrichedMarkets, selectedCategorySlug, statusFilter]);
  // --- End of refactored useMemo ---

  // Update click handler for focus areas
  const handleCategoryClick = (categorySlug: string | null) => {
    setSelectedCategorySlug(categorySlug);
    const params = new URLSearchParams(searchParams);
    if (categorySlug === null) {
      params.delete('category');
    } else {
      params.set('category', categorySlug);
    }
    router.replace(`/forecasting?${params.toString()}`);
  };

  const handleStatusFilterClick = (filter: 'all' | 'active') => {
    setStatusFilter(filter);
  };

  // Helper to find FocusArea data by category slug for UI styling
  const getCategoryStyle = (categorySlug: string): FocusArea | undefined => {
    return FOCUS_AREAS.find((fa) => fa.id === categorySlug);
  };

  return (
    <div className="flex flex-col md:flex-row min-h-0">
      {/* Main Content */}
      <div className="flex-1 pr-6">
        {/* Only show the filter button on mobile */}
        {isMobile && (
          <div className="sticky top-20 z-10 flex justify-end mb-2">
            <div className="flex items-center bg-background/30 p-2 backdrop-blur-sm rounded-full">
              <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex items-center justify-center opacity-40 hover:opacity-90 w-8 h-8 rounded-full"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="sr-only">Filter</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] pr-0">
                  <FocusAreaFilter
                    selectedCategorySlug={selectedCategorySlug}
                    handleCategoryClick={handleCategoryClick}
                    statusFilter={statusFilter}
                    handleStatusFilterClick={handleStatusFilterClick}
                    isLoadingCategories={isLoadingCategories}
                    categories={categories}
                    getCategoryStyle={getCategoryStyle}
                  />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        )}

        {isLoadingMarkets && (
          <div className="space-y-12 flex flex-col pt-10">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton
                  className="h-40 w-full border-t-[6px]"
                  style={{ borderTopColor: DEFAULT_CATEGORY_COLOR }}
                />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-5/6" />
              </div>
            ))}
          </div>
        )}

        {!isLoadingMarkets && (
          <div className="relative min-h-[300px] pt-2">
            <AnimatePresence mode="popLayout">
              {groupedMarkets.length === 0 && (
                <motion.div
                  key="zero-state"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-full pt-48 text-center text-muted-foreground"
                >
                  <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
                  No forecasting markets match the selected filters.
                </motion.div>
              )}
              {groupedMarkets.map((market) => (
                <motion.div
                  layout
                  key={market.key}
                  initial={{ opacity: 0, scale: 0.98, y: 0 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: 0 }}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                  className="mb-12 relative cursor-pointer transition-all hover:translate-y-[-2px] hover:opacity-95 hover:shadow-sm"
                >
                  <MarketGroupPreview
                    chainId={market.chainId}
                    marketAddress={market.marketAddress}
                    epochs={market.epochs}
                    color={market.color}
                    displayQuestion={market.displayQuestion}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Desktop filter panel - sticky on the right side */}
      {!isMobile && (
        <div className="hidden md:block w-[280px] sticky top-20 max-h-[calc(100vh-5rem)] self-start overflow-y-auto">
          <FocusAreaFilter
            selectedCategorySlug={selectedCategorySlug}
            handleCategoryClick={handleCategoryClick}
            statusFilter={statusFilter}
            handleStatusFilterClick={handleStatusFilterClick}
            isLoadingCategories={isLoadingCategories}
            categories={categories}
            getCategoryStyle={getCategoryStyle}
          />
        </div>
      )}
    </div>
  );
};

export default ForecastingTable;

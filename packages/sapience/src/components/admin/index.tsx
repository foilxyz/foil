'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useResources } from '@sapience/ui/hooks/useResources';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import CategoryFilter from './CategoryFilter';
import columns from './columns';
import DataTable from './data-table';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';
import { foilApi } from '~/lib/utils/util';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

const DEFAULT_ERROR_MESSAGE = 'An error occurred. Please try again.';

const ReindexFactoryForm = () => {
  const { signMessageAsync } = useSignMessage();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [factoryAddress, setFactoryAddress] = useState(
    '0xA61BF5F56a6a035408d5d76EbE58F8204891FB40'
  );
  const [chainId, setChainId] = useState('8453'); // Default to Base

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!factoryAddress.startsWith('0x')) {
      toast({
        variant: 'destructive',
        title: 'Invalid address',
        description: 'Factory address must start with 0x',
      });
      return;
    }

    try {
      setIsLoading(true);

      // Generate timestamp and signature
      const timestamp = Date.now(); // Use Date.now() for consistency
      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG, // Use standard auth message
      });

      // Construct the API URL from environment variable
      const apiUrl = `${process.env.NEXT_PUBLIC_FOIL_API_URL || ''}/reindex/market-group-factory`;

      // Call the API endpoint
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chainId: Number(chainId),
          factoryAddress,
          signature,
          timestamp, // Send the timestamp used for validation
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reindex factory');
      }

      toast({
        title: 'Reindex started',
        description: 'The market group factory reindexing process has started.',
      });

      // Reset form
      setFactoryAddress('');
    } catch (error) {
      console.error('Reindex factory error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="factoryAddress" className="text-sm font-medium">
          Factory Address
        </label>
        <Input
          id="factoryAddress"
          placeholder="0x..."
          value={factoryAddress}
          onChange={(e) => setFactoryAddress(e.target.value)}
        />
        {factoryAddress && !factoryAddress.startsWith('0x') && (
          <p className="text-sm text-red-500">Address must start with 0x</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="chainSelect" className="text-sm font-medium">
          Chain
        </label>
        <Select value={chainId} onValueChange={setChainId}>
          <SelectTrigger id="chainSelect" className="w-full">
            <SelectValue placeholder="Select chain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Ethereum</SelectItem>
            <SelectItem value="10">Optimism</SelectItem>
            <SelectItem value="8453">Base</SelectItem>
            <SelectItem value="42161">Arbitrum</SelectItem>
            <SelectItem value="137">Polygon</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? (
          <>
            <LottieLoader width={16} height={16} />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Reindex Factory'
        )}
      </Button>
    </form>
  );
};

const IndexResourceForm = () => {
  const { signMessageAsync } = useSignMessage();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { data: resourcesData } = useResources();
  const [selectedResource, setSelectedResource] = useState('');
  const [startTimestamp, setStartTimestamp] = useState('');
  const [endTimestamp, setEndTimestamp] = useState('');

  const handleIndexResource = async () => {
    try {
      setIsLoading(true);
      const timestamp = Date.now();

      let signature = '';
      if (process.env.NODE_ENV === 'production') {
        signature = await signMessageAsync({
          message: ADMIN_AUTHENTICATE_MSG,
        });
      }

      const response = await foilApi.post('/reindex/resource', {
        slug: selectedResource,
        startTimestamp,
        ...(endTimestamp && { endTimestamp }),
        ...(signature && {
          signature,
          signatureTimestamp: timestamp,
        }),
      });

      if (response.success) {
        toast({
          title: 'Indexing complete',
          description: 'Resource has been reindexed successfully',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Indexing failed',
          description: response.error,
          variant: 'destructive',
        });
      }
    } catch (e: unknown) {
      console.error('Error in handleIndexResource:', e);
      toast({
        title: 'Indexing failed',
        description: (e as Error)?.message || DEFAULT_ERROR_MESSAGE,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="text-sm font-medium">Resource</span>
        <Select value={selectedResource} onValueChange={setSelectedResource}>
          <SelectTrigger>
            <SelectValue placeholder="Select a resource" />
          </SelectTrigger>
          <SelectContent>
            {resourcesData?.map((resource: { slug: string; name: string }) => (
              <SelectItem key={resource.slug} value={resource.slug}>
                {resource.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Start Timestamp</span>
        <Input
          type="number"
          value={startTimestamp}
          onChange={(e) => setStartTimestamp(e.target.value)}
          placeholder="Enter Unix timestamp"
        />
        <p className="text-sm text-muted-foreground">
          <a
            href="https://www.unixtimestamp.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Unix seconds
          </a>
          , 10 digits
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">End Timestamp (Optional)</span>
        <Input
          type="number"
          value={endTimestamp}
          onChange={(e) => setEndTimestamp(e.target.value)}
          placeholder="Enter Unix timestamp"
        />
        <p className="text-sm text-muted-foreground">
          <a
            href="https://www.unixtimestamp.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Unix seconds
          </a>
          , 10 digits
        </p>
      </div>

      <Button
        onClick={handleIndexResource}
        disabled={!selectedResource || !startTimestamp || isLoading}
        className="w-full"
      >
        {isLoading ? (
          <div className="animate-spin">
            <Loader2 className="w-4 h-4" />
          </div>
        ) : (
          'Submit'
        )}
      </Button>
    </div>
  );
};

const RefreshCacheForm = () => {
  const { signMessageAsync } = useSignMessage();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { data: resourcesData } = useResources();
  const [refreshResourceSlug, setRefreshResourceSlug] = useState('all');

  const handleRefreshCache = async () => {
    try {
      setIsLoading(true);
      const timestamp = Date.now();

      // Always request signature, matching the pattern in other admin functions
      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG,
      });

      // Build the endpoint URL based on whether a specific resource is selected
      const endpoint =
        refreshResourceSlug && refreshResourceSlug !== 'all'
          ? `/cache/refresh-candle-cache/${refreshResourceSlug}?hardInitialize=true&signature=${signature}&signatureTimestamp=${timestamp}`
          : `/cache/refresh-candle-cache?hardInitialize=true&signature=${signature}&signatureTimestamp=${timestamp}`;

      const response = await foilApi.get(endpoint);

      if (response.success) {
        toast({
          title: 'Cache refreshed',
          description:
            refreshResourceSlug && refreshResourceSlug !== 'all'
              ? `Cache for ${refreshResourceSlug} has been successfully refreshed`
              : 'Cache has been successfully refreshed for all resources',
          variant: 'default',
        });
        setRefreshResourceSlug('all'); // Reset to "all" instead of empty string
      } else {
        toast({
          title: 'Cache refresh failed',
          description: response.error || DEFAULT_ERROR_MESSAGE,
          variant: 'destructive',
        });
      }
    } catch (e: unknown) {
      console.error('Error in handleRefreshCache:', e);
      toast({
        title: 'Cache refresh failed',
        description: (e as Error)?.message || DEFAULT_ERROR_MESSAGE,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        This will trigger a hard initialization of the cache. This operation
        requires authentication.
      </p>

      <div className="space-y-2">
        <span className="text-sm font-medium">Resource (Optional)</span>
        <Select
          value={refreshResourceSlug}
          onValueChange={setRefreshResourceSlug}
        >
          <SelectTrigger>
            <SelectValue placeholder="All resources (default)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resources</SelectItem>
            {resourcesData?.map((resource: { slug: string; name: string }) => (
              <SelectItem key={resource.slug} value={resource.slug}>
                {resource.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select a specific resource to refresh, or leave empty to refresh all
          resources.
        </p>
      </div>

      <Button
        onClick={handleRefreshCache}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? (
          <div className="animate-spin">
            <Loader2 className="w-4 h-4" />
          </div>
        ) : (
          'Refresh Cache'
        )}
      </Button>
    </div>
  );
};

const Admin = () => {
  const { data: marketGroups, isLoading, error } = useEnrichedMarketGroups();
  const [reindexDialogOpen, setReindexDialogOpen] = useState(false);
  const [indexResourceOpen, setIndexResourceOpen] = useState(false);
  const [refreshCacheOpen, setRefreshCacheOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Sort market groups with most recent (highest ID) first
  const sortedMarketGroups = marketGroups
    ? [...marketGroups].sort((a, b) => {
        // Sort by id descending (most recent first)
        return Number(b.id) - Number(a.id);
      })
    : [];

  return (
    <div className="container pt-24 mx-auto px-6 pb-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl">Control Center</h1>
        <div className="flex items-center space-x-4">
          <Button asChild>
            <a href="/admin/create">
              <Plus className="mr-1 h-4 w-4" />
              New Market Group
            </a>
          </Button>
          <Dialog open={reindexDialogOpen} onOpenChange={setReindexDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <RefreshCw className="mr-1 h-4 w-4" />
                Reindex Factory
              </Button>
            </DialogTrigger>
            <DialogContent className="overflow-hidden max-w-md">
              <DialogHeader>
                <DialogTitle>Reindex Market Group Factory</DialogTitle>
              </DialogHeader>
              <ReindexFactoryForm />
            </DialogContent>
          </Dialog>
          <Dialog open={indexResourceOpen} onOpenChange={setIndexResourceOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Index Resource
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Index Resource</DialogTitle>
              </DialogHeader>
              <IndexResourceForm />
            </DialogContent>
          </Dialog>
          <Dialog open={refreshCacheOpen} onOpenChange={setRefreshCacheOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Refresh Cache
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Refresh Cache</DialogTitle>
              </DialogHeader>
              <RefreshCacheForm />
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <div>
        {isLoading && (
          <div className="flex justify-center items-center py-8">
            <LottieLoader width={32} height={32} />
          </div>
        )}
        {error && (
          <p className="text-red-500">Error loading markets: {error.message}</p>
        )}
        {sortedMarketGroups && sortedMarketGroups.length > 0 ? (
          <>
            <CategoryFilter
              marketGroups={sortedMarketGroups}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
            <DataTable
              columns={columns}
              data={sortedMarketGroups}
              categoryFilter={selectedCategory}
            />
          </>
        ) : (
          !isLoading && <p>No active market groups found.</p>
        )}
      </div>
    </div>
  );
};

export default Admin;

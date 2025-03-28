import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { Loader2, Copy } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import { getEnsName } from 'viem/ens';
import { usePublicClient } from 'wagmi';

import { badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { foilApi } from '~/lib/utils/util';

import NumberDisplay from './numberDisplay';
import PositionDisplay from './PositionDisplay';

interface Props {
  params: {
    id: string;
    epoch: string;
  };
}

interface Position {
  positionId: string;
  chain?: {
    id: string;
  };
  address: string;
  epoch: {
    market?: {
      chainId?: string;
      address?: string;
      isYin?: boolean;
    };
  };
  isLP: boolean;
  owner: string;
}

interface GroupedPosition {
  owner: string;
  positions: Position[];
  totalPnL: number;
  totalCollateralFlow: number;
  ownerMaxCollateral: number;
}

const useLeaderboard = (marketId: string, epochId: string) => {
  return useQuery({
    queryKey: ['epochLeaderboard', marketId, epochId],
    queryFn: async () => {
      // Get leaderboard and positions
      const leaderboard = await foilApi.get(
        `/leaderboard?contractId=${marketId}`
      );
      return [...leaderboard];
    },
  });
};

const PositionCell = ({ row }: { row: { original: GroupedPosition } }) => (
  <div className="flex flex-wrap gap-1.5">
    {row.original.positions.map((position) => (
      <Link
        key={position.positionId}
        href={`/positions/${position?.epoch?.market?.chainId}:${position.epoch?.market?.address}/${position.positionId}`}
        className={`${badgeVariants({ variant: 'outline' })} hover:bg-muted transition-background`}
      >
        <PositionDisplay
          positionId={position.positionId?.toString()}
          marketType={position.epoch?.market?.isYin ? 'yin' : 'yang'}
        />
      </Link>
    ))}
  </div>
);

const PnLCell = ({ cell }: { cell: { getValue: () => unknown } }) => {
  const value = cell.getValue() as number;
  const prefix = value > 0 ? '+' : '';
  return (
    <span className="md:text-xl whitespace-nowrap">
      {prefix}
      <NumberDisplay value={value / 1e18} /> wstETH
    </span>
  );
};

const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const AddressDisplay = ({ address }: { address: string }) => {
  const publicClient = usePublicClient();
  const [ensName, setEnsName] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);

  useEffect(() => {
    const resolveEns = async () => {
      if (!publicClient) return;
      try {
        const ens = await getEnsName(publicClient, {
          address: address as `0x${string}`,
        });
        if (ens) setEnsName(ens);
      } catch (error) {
        console.error('Error resolving ENS:', error);
      }
    };
    resolveEns();
  }, [address, publicClient]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(address);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1000);
  };

  return (
    <div className="flex items-center gap-2 md:text-xl">
      <span>{ensName || formatAddress(address)}</span>
      <TooltipProvider>
        <Tooltip open={showCopied}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0.5"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copied!</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

const OwnerCell = ({ cell }: { cell: { getValue: () => unknown } }) => (
  <AddressDisplay address={cell.getValue() as string} />
);

const RankCell = ({ row }: { row: { index: number } }) => (
  <span className="text-xl md:text-4xl font-bold flex justify-center">
    {row.index + 1}
  </span>
);

const RoiCell = ({ cell }: { cell: { getValue: () => unknown } }) => {
  const value = cell.getValue() as number;
  const prefix = value > 0 ? '+' : '';
  return (
    <span className="md:text-xl whitespace-nowrap">
      {prefix}
      <NumberDisplay value={value} /> %
    </span>
  );
};

const Leaderboard = ({ params }: Props) => {
  const { data: leaderboardPositions, isLoading } = useLeaderboard(
    params.id,
    params.epoch
  );

  const columns = useMemo<ColumnDef<GroupedPosition>[]>(
    () => [
      {
        id: 'rank',
        header: 'Rank',
        cell: RankCell,
      },
      {
        id: 'owner',
        header: 'Wallet Address',
        accessorKey: 'owner',
        cell: OwnerCell,
      },
      {
        id: 'roi',
        header: 'ROI',
        accessorFn: (row) => row.totalPnL / row.ownerMaxCollateral,
        cell: RoiCell,
      },
      {
        id: 'pnl',
        header: 'Profit/Loss',
        accessorKey: 'totalPnL',
        cell: PnLCell,
      },
      {
        id: 'positions',
        header: 'Positions',
        cell: PositionCell,
      },
    ],
    []
  );

  const groupedPositions = useMemo(() => {
    if (!leaderboardPositions) return [] as GroupedPosition[];
    console.log('leaderboardPositions', leaderboardPositions);

    // Group leaderboardPositions by owner
    const groupedByOwner = leaderboardPositions.reduce<
      Record<string, GroupedPosition>
    >((acc, position) => {
      if (!acc[position.owner]) {
        acc[position.owner] = {
          owner: position.owner,
          positions: [],
          totalPnL: 0,
          totalCollateralFlow: 0,
          ownerMaxCollateral: 0,
        };
      }
      acc[position.owner].positions = position.positions;
      acc[position.owner].totalPnL = position.totalPnL;
      acc[position.owner].totalCollateralFlow = position.totalCollateralFlow;
      acc[position.owner].ownerMaxCollateral = position.ownerMaxCollateral;
      return acc;
    }, {});

    // Convert to array and sort by total PnL
    return Object.values(groupedByOwner).sort(
      (a, b) =>
        b.totalPnL / b.ownerMaxCollateral - a.totalPnL / a.ownerMaxCollateral
    );
  }, [leaderboardPositions]);

  const table = useReactTable<GroupedPosition>({
    data: groupedPositions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 w-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-screen-lg mx-auto flex items-center p-12">
      <div className="border border-border rounded-lg w-full">
        <h1 className="text-2xl md:text-5xl font-bold my-4 md:mt-10 md:mb-8 text-center">
          🏆 Leaderboard 🏆
        </h1>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-transparent">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Leaderboard;

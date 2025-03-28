/* eslint-disable sonarjs/cognitive-complexity */
import { useRouter, useSearchParams } from 'next/navigation';
import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { useAccount, useReadContracts } from 'wagmi';

import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { PositionKind } from '~/lib/interfaces/interfaces';
import { positionHasBalance } from '~/lib/utils/util';

interface Positions {
  liquidityPositions: FoilPosition[];
  tradePositions: FoilPosition[];
}

interface AddEditPositionContextType {
  nftId: number;
  setNftId: (id: number | undefined) => void;
  positions: Positions;
  refreshPositions: () => Promise<void>;
  isLoading: boolean;
}

const AddEditPositionContext = createContext<
  AddEditPositionContextType | undefined
>(undefined);

export const AddEditPositionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasSetInitialPosition = useRef(false);
  const positionId = searchParams.get('positionId');
  const nftId = positionId ? Number(positionId) : 0;

  const { address } = useAccount();
  const {
    tokenIds,
    refetch: refetchTokenIds,
    isLoadingBalance,
    isRefetchingBalance,
    isLoadingContracts,
  } = useTokenIdsOfOwner(address as `0x${string}`);
  const {
    foilData,
    address: marketAddress,
    chainId,
  } = useContext(PeriodContext);

  const {
    data: positionsData,
    refetch: refetchPositions,
    isLoading: isLoadingPositions,
    isRefetching: isRefetchingPositions,
  } = useReadContracts({
    contracts: tokenIds.map((i) => ({
      abi: foilData.abi,
      address: marketAddress as `0x${string}`,
      functionName: 'getPosition',
      chainId,
      args: [i],
    })),
  });

  const positions: Positions = React.useMemo(() => {
    const _positions: Positions = {
      liquidityPositions: [],
      tradePositions: [],
    };
    if (!positionsData) return _positions;

    for (const resp of positionsData) {
      const position = resp.result as FoilPosition;
      if (position.kind === PositionKind.Liquidity) {
        _positions.liquidityPositions.push(position);
      } else if (position.kind === PositionKind.Trade) {
        _positions.tradePositions.push(position);
      }
    }
    return _positions;
  }, [positionsData]);

  useEffect(() => {
    if (
      !hasSetInitialPosition.current &&
      (positions.liquidityPositions.length || positions.tradePositions.length)
    ) {
      // filters to find the postion with balance and then takes the last one.
      const lastLiquidityPosition = positions.liquidityPositions
        .filter((pos) => positionHasBalance(pos))
        .slice(-1)[0];
      const lastTradePosition = positions.tradePositions
        .filter((pos) => positionHasBalance(pos))
        .slice(-1)[0];

      let lastPositionId: number | undefined;
      const currentPath = window.location.pathname.toLowerCase();

      if (currentPath.includes('trade')) {
        lastPositionId = lastTradePosition?.id
          ? Number(lastTradePosition.id)
          : undefined;
      } else if (currentPath.includes('pool')) {
        lastPositionId = lastLiquidityPosition?.id
          ? Number(lastLiquidityPosition.id)
          : undefined;
      } else {
        const liquidityId = lastLiquidityPosition?.id
          ? Number(lastLiquidityPosition.id)
          : undefined;
        const tradeId = lastTradePosition?.id
          ? Number(lastTradePosition.id)
          : undefined;
        lastPositionId = Math.max(
          liquidityId ?? -Infinity,
          tradeId ?? -Infinity
        );
      }

      // if no positions with value found, fall back to most recent position
      if (lastPositionId === undefined) {
        const fallbackLiquidityPosition =
          positions.liquidityPositions.slice(-1)[0];
        const fallbackTradePosition = positions.tradePositions.slice(-1)[0];

        if (currentPath.includes('trade')) {
          lastPositionId = fallbackTradePosition?.id
            ? Number(fallbackTradePosition.id)
            : undefined;
        } else if (currentPath.includes('pool')) {
          lastPositionId = fallbackLiquidityPosition?.id
            ? Number(fallbackLiquidityPosition.id)
            : undefined;
        }
      }

      if (lastPositionId !== undefined) {
        hasSetInitialPosition.current = true;
        router.push(`${window.location.pathname}?positionId=${lastPositionId}`);
      }
    }
  }, [positions]);

  const updateUrlWithPositionId = useCallback(
    (id: number | undefined) => {
      hasSetInitialPosition.current = true; // Mark as set when manually changing
      if (!id) {
        router.push(window.location.pathname);
      } else {
        router.push(`${window.location.pathname}?positionId=${id}`);
      }
    },
    [router]
  );

  const refreshPositions = useCallback(async () => {
    await refetchTokenIds();
    await refetchPositions();
  }, [refetchTokenIds, refetchPositions]);

  const isLoading = useMemo(() => {
    return (
      isLoadingBalance ||
      isLoadingContracts ||
      isLoadingPositions ||
      isRefetchingBalance ||
      isRefetchingPositions
    );
  }, [
    isLoadingBalance,
    isLoadingContracts,
    isLoadingPositions,
    isRefetchingBalance,
    isRefetchingPositions,
  ]);

  return (
    <AddEditPositionContext.Provider
      value={{
        nftId: nftId ?? 0,
        setNftId: updateUrlWithPositionId,
        positions,
        refreshPositions,
        isLoading,
      }}
    >
      {children}
    </AddEditPositionContext.Provider>
  );
};

export const useAddEditPosition = () => {
  const context = useContext(AddEditPositionContext);
  if (context === undefined) {
    throw new Error(
      'useAddEditPosition must be used within a AddEditPositionProvider'
    );
  }
  return context;
};

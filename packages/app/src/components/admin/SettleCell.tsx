import { Button } from '@foil/ui/components/ui/button';
import { useToast } from '@foil/ui/hooks/use-toast';
import type React from 'react';
import { useState } from 'react';
import { zeroAddress } from 'viem';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';

import useFoilDeployment from '../useFoilDeployment';
import erc20ABI from '~/lib/erc20abi.json';
import { useSettlementPrice } from '~/lib/hooks/useSettlementPrice';

import type { MarketItemProps } from './types';

const SettleCell: React.FC<MarketItemProps> = ({
  marketGroup,
  market,
  missingBlocks,
}) => {
  const account = useAccount();
  const { address } = account;
  const { toast } = useToast();
  const { foilData, loading, error, foilVaultData } = useFoilDeployment(
    marketGroup?.chainId
  );
  const [loadingAction, setLoadingAction] = useState<{
    [actionName: string]: boolean;
  }>({});

  const { sqrtPriceX96, isLoading: isPriceLoading } = useSettlementPrice(
    marketGroup,
    market
  );

  const { data: getEpochData } = useReadContract({
    address: marketGroup.address as `0x${string}`,
    abi: foilData?.abi,
    functionName: 'getEpoch',
    args: [BigInt(market.marketId)],
    chainId: marketGroup.chainId,
    query: {
      enabled: !loading && !error && !!foilData,
    },
  }) as any;

  const epochData = getEpochData ? getEpochData[0] : undefined;
  const marketParams = getEpochData ? getEpochData[1] : undefined;
  const epochSettled = epochData ? epochData.settled : undefined;
  const bondAmount = marketParams ? marketParams.bondAmount : undefined;
  const bondCurrency = marketParams ? marketParams.bondCurrency : undefined;

  const { data: allowance } = useReadContract({
    abi: erc20ABI,
    address: bondCurrency as `0x${string}`,
    functionName: 'allowance',
    args: [address, foilVaultData.yin.address],
    account: address || zeroAddress,
    chainId: marketGroup.chainId,
    query: {
      enabled:
        !!address && !!bondAmount && !loading && !error && !!foilVaultData,
    },
  });

  const { writeContract: settleWithPrice } = useWriteContract({
    mutation: {
      onError: (settleError) => {
        console.error('Failed to settle: ', settleError);
        toast({
          variant: 'destructive',
          title: 'Failed to settle',
          description: (settleError as Error).message,
        });
        resetAfterError();
      },
      onSuccess: () => {
        toast({
          title: 'Transaction submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const handleSettleWithPrice = () => {
    settleWithPrice({
      address: marketGroup.owner as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'submitMarketSettlementPrice',
          inputs: [
            {
              name: 'epochId',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'price',
              type: 'uint160',
              internalType: 'uint160',
            },
          ],
          outputs: [
            {
              name: 'assertionId',
              type: 'bytes32',
              internalType: 'bytes32',
            },
          ],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'submitMarketSettlementPrice',
      args: [BigInt(market.marketId), sqrtPriceX96],
    });
  };

  const resetAfterError = () => {
    setLoadingAction((prev) => ({ ...prev, settle: false }));
  };

  const buttonIsLoading = loadingAction.settle || isPriceLoading;

  const currentTime = Math.floor(Date.now() / 1000);
  const isEpochEnded = market.endTimestamp && currentTime > market.endTimestamp;

  // Check for missing blocks
  const key = `${marketGroup.address}-${market.marketId}`;
  const missingBlocksCount = missingBlocks[key]?.resourcePrice?.length ?? null;
  const areMissingBlocksLoading = missingBlocksCount === null;
  const hasMissingBlocks = missingBlocksCount && missingBlocksCount > 0;

  // Check if bond amount is approved
  const requiresApproval =
    !allowance || (bondAmount && bondAmount > (allowance as bigint));

  const getButtonText = () => {
    if (!isEpochEnded) {
      return 'Epoch Active';
    }
    if (areMissingBlocksLoading) {
      return 'Loading Blocks...';
    }
    if (hasMissingBlocks) {
      return 'Missing Blocks';
    }
    if (requiresApproval) {
      return 'Bond Not Approved';
    }
    return 'Settle with Price';
  };

  if (epochSettled) {
    return (
      <Button disabled size="xs">
        Settled
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          disabled={
            !getEpochData ||
            buttonIsLoading ||
            !isEpochEnded ||
            areMissingBlocksLoading ||
            Boolean(hasMissingBlocks) ||
            requiresApproval
          }
          onClick={handleSettleWithPrice}
        >
          {getButtonText()}
        </Button>
      </div>
    </div>
  );
};

export default SettleCell;

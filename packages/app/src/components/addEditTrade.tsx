/* eslint-disable sonarjs/cognitive-complexity */
import { Button } from '@foil/ui/components/ui/button';
import { Form } from '@foil/ui/components/ui/form';
import { Tabs, TabsList, TabsTrigger } from '@foil/ui/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { useToast } from '@foil/ui/hooks/use-toast';
import { debounce } from 'lodash';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useState, useEffect, useContext, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import type { AbiFunction } from 'viem';
import { decodeEventLog, formatUnits, parseUnits, zeroAddress } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
  useSimulateContract,
  useChainId,
  useSwitchChain,
  usePublicClient,
} from 'wagmi';

import { useConnectWallet } from '../lib/context/ConnectWalletProvider';
import erc20ABI from '../lib/erc20abi.json';
import {
  HIGH_PRICE_IMPACT,
  MIN_BIG_INT_SIZE,
  TOKEN_DECIMALS,
} from '~/lib/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { useFoil } from '~/lib/context/FoilProvider';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import {
  removeLeadingZeros,
  convertGgasPerWstEthToGwei,
} from '~/lib/utils/util';

import NumberDisplay from './numberDisplay';
import PositionSelector from './positionSelector';
import SizeInput from './sizeInput';
import SlippageTolerance from './slippageTolerance';

export default function AddEditTrade() {
  const { nftId, refreshPositions, setNftId } = useAddEditPosition();

  // form states
  const [sizeChange, setSizeChange] = useState<bigint>(BigInt(0));
  const [tradeDirection, setTradeDirection] = useState<'Long' | 'Short'>(
    'Long'
  );

  // component states
  const [pendingTxn, setPendingTxn] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>('0');
  const [quotedResultingWalletBalance, setQuotedResultingWalletBalance] =
    useState<string>('0');
  const [walletBalanceLimit, setWalletBalanceLimit] = useState<bigint>(
    BigInt(0)
  );
  const [positionCollateralLimit, setPositionCollateralLimit] =
    useState<bigint>(BigInt(0));
  const [resultingPositionCollateral, setResultingPositionCollateral] =
    useState<bigint>(BigInt(0));
  const [txnStep, setTxnStep] = useState(0);
  const [collateralInput, setCollateralInput] = useState<bigint>(BigInt(0));

  const account = useAccount();
  const { isConnected, address } = account;
  const isEdit = !!nftId;

  const {
    address: marketAddress,
    collateralAsset,
    collateralAssetTicker,
    collateralAssetDecimals,
    epoch,
    foilData,
    chainId,
    pool,
    liquidity,
    refetchUniswapData,
    useMarketUnits,
    unitDisplay,
    market,
  } = useContext(PeriodContext);
  const { stEthPerToken } = useFoil();

  if (!epoch) {
    throw new Error('Epoch is not defined');
  }

  const { toast } = useToast();

  const isLong = tradeDirection === 'Long';

  const sizeChangeInContractUnit = useMemo(() => {
    const baseSize = sizeChange * BigInt(1e9);
    return isLong ? baseSize : -baseSize;
  }, [sizeChange, isLong]);
  const isNonZeroSizeChange = sizeChangeInContractUnit !== BigInt(0);

  const formError = useMemo(() => {
    if (Number(quotedResultingWalletBalance) < 0) {
      return 'Insufficient wallet balance to perform this trade.';
    }
    if (
      sizeChangeInContractUnit > BigInt(0) &&
      (!liquidity ||
        (isLong &&
          parseFloat(formatUnits(sizeChangeInContractUnit, TOKEN_DECIMALS)) >
            Number(liquidity)))
    ) {
      return 'Not enough liquidity to perform this trade.';
    }
    if (quoteError) {
      console.error('quoteError', quoteError);
      return 'The protocol cannot generate a quote for this order.';
    }
    return '';
  }, [
    quoteError,
    liquidity,
    sizeChangeInContractUnit,
    isLong,
    quotedResultingWalletBalance,
    walletBalance,
  ]);

  // Position data
  const { data: positionData, refetch: refetchPositionData } = useReadContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'getPosition',
    args: [nftId],
    query: {
      enabled: isEdit,
    },
  }) as { data: FoilPosition; refetch: any; isRefetching: boolean };

  useEffect(() => {
    if (positionData && isEdit) {
      setTradeDirection(positionData.vGasAmount > BigInt(0) ? 'Long' : 'Short');
      setSizeChange(BigInt(0));
    }
  }, [positionData, isEdit]);

  const originalPositionSizeInContractUnit: bigint = useMemo(() => {
    if (isEdit && positionData) {
      const sideFactor =
        positionData.vGasAmount > BigInt(0) ? BigInt(1) : BigInt(-1);
      const _sizeBigInt =
        positionData.vGasAmount > BigInt(0)
          ? positionData.vGasAmount
          : positionData.borrowedVGas;
      const adjustedSize =
        _sizeBigInt >= MIN_BIG_INT_SIZE ? _sizeBigInt : BigInt(0);
      return sideFactor * adjustedSize;
    }

    return BigInt(0);
  }, [positionData, isEdit]);

  const desiredSizeInContractUnit = useMemo(() => {
    if (!isEdit) {
      return sizeChangeInContractUnit;
    }

    const originalPositionIsLong = positionData?.vGasAmount > BigInt(0);
    const currentSize = originalPositionIsLong
      ? positionData?.vGasAmount || BigInt(0)
      : -(positionData?.borrowedVGas || BigInt(0));

    return currentSize + sizeChangeInContractUnit;
  }, [isEdit, positionData, sizeChangeInContractUnit]);

  // Collateral balance for current address/account
  const { data: collateralBalance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'balanceOf',
    args: [address],
    chainId,
  });

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [address, marketAddress],
    account: address || zeroAddress,
    chainId,
  });

  const quoteCreatePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [epoch, desiredSizeInContractUnit],
    chainId,
    account: address || zeroAddress,
    query: { enabled: !isEdit && isNonZeroSizeChange },
  });

  const quoteModifyPositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: [nftId, desiredSizeInContractUnit],
    chainId,
    account: address || zeroAddress,
    query: { enabled: isEdit && isNonZeroSizeChange },
  });

  const quoteClosePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: [nftId, BigInt(0)],
    chainId,
    account: address || zeroAddress,
    query: {
      enabled: isEdit && !!positionData,
      refetchOnMount: true,
    },
  });

  useEffect(() => {
    if (quoteModifyPositionResult?.error && isEdit && isNonZeroSizeChange) {
      setQuoteError(quoteModifyPositionResult.error.message);
    } else if (quoteCreatePositionResult.error && !isEdit) {
      setQuoteError(quoteCreatePositionResult.error.message);
    } else {
      setQuoteError(null);
    }
  }, [
    quoteCreatePositionResult.error,
    quoteModifyPositionResult?.error,
    sizeChangeInContractUnit,
    isEdit,
  ]);

  const isLoadingCollateralChange = isEdit
    ? quoteModifyPositionResult.isFetching
    : quoteCreatePositionResult.isFetching;

  // Write contract hooks
  const { data: hash, writeContract } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `There was an issue creating/updating your position: ${(error as Error).message}`,
        });
        setPendingTxn(false);
      },
      onSuccess: () => {
        toast({
          title: 'Transaction Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const { data: approveHash, writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Approval Failed',
          description: `Failed to approve: ${(error as Error).message}`,
        });
        setPendingTxn(false);
      },
      onSuccess: () => {
        toast({
          title: 'Approval Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const { isSuccess: isConfirmed, data: transactionReceipt } =
    useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isConfirmed && txnStep === 2) {
      if (isEdit) {
        toast({
          title: 'Success',
          description:
            "We've updated your position for you. Your transaction will be displayed in the app as soon as possible.",
        });
        resetAfterSuccess();
      } else {
        for (const log of transactionReceipt.logs) {
          try {
            const event = decodeEventLog({
              abi: foilData.abi,
              data: log.data,
              topics: log.topics,
            });

            if ((event as any).eventName === 'TraderPositionCreated') {
              const nftId = (event as any).args.positionId.toString();
              toast({
                title: 'Position Created',
                description: `Your position has been created as position ${nftId}`,
              });
              setNftId(nftId);
              resetAfterSuccess();
              return;
            }
          } catch (error) {
            // This log was not for the TraderPositionCreated event, continue to next log
          }
        }
        toast({
          title: 'Success',
          description:
            "We've created your position for you. Your transaction will be displayed in the app as soon as possible.",
        });
        resetAfterSuccess();
      }
    }
  }, [isConfirmed, transactionReceipt, txnStep]);

  useEffect(() => {
    if (approveSuccess && txnStep === 1) {
      refetchAllowance();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

      if (isEdit) {
        const isClosing = form.getValues('isClosePosition');
        const callSizeInContractUnit = isClosing
          ? BigInt(0)
          : desiredSizeInContractUnit;
        const callCollateralDeltaLimit = isClosing
          ? BigInt(0)
          : collateralDeltaLimit;

        writeContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: 'modifyTraderPosition',
          args: [
            nftId,
            callSizeInContractUnit,
            callCollateralDeltaLimit,
            deadline,
          ],
        });
      } else {
        writeContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: 'createTraderPosition',
          args: [
            epoch,
            desiredSizeInContractUnit,
            collateralDeltaLimit,
            deadline,
          ],
        });
      }
      setTxnStep(2);
    }
  }, [approveSuccess, txnStep]);

  const [quotedCollateralDelta, quotedFillPrice] = useMemo(() => {
    const result = isEdit
      ? quoteModifyPositionResult.data?.result
      : quoteCreatePositionResult.data?.result;

    if (!result) {
      return [BigInt(0), BigInt(0)];
    }

    if (isEdit) {
      const [expectedCollateralDelta, , fillPrice] = result;
      return [expectedCollateralDelta, fillPrice];
    }
    const [requiredCollateral, fillPrice] = result;
    return [requiredCollateral, fillPrice];
  }, [isEdit, quoteCreatePositionResult.data, quoteModifyPositionResult.data]);

  const priceImpact: number = useMemo(() => {
    if (pool?.token0Price && quotedFillPrice && isNonZeroSizeChange) {
      const fillPrice = Number(quotedFillPrice) / 1e18;
      const referencePrice = parseFloat(pool.token0Price.toSignificant(18));
      return Math.abs((fillPrice / referencePrice - 1) * 100);
    }
    return 0;
  }, [quotedFillPrice, pool]);
  const showPriceImpactWarning = priceImpact > HIGH_PRICE_IMPACT;

  const closePositionPriceImpact: number = useMemo(() => {
    if (!pool?.token0Price || !positionData) return 0;

    if (
      positionData.vGasAmount === BigInt(0) &&
      positionData.borrowedVGas === BigInt(0)
    ) {
      return 0;
    }
    const closeQuote = quoteClosePositionResult.data?.result;
    if (!closeQuote) return 0;

    const [, , fillPrice] = closeQuote;
    const referencePrice = parseFloat(pool.token0Price.toSignificant(18));
    return Math.abs((Number(fillPrice) / 1e18 / referencePrice - 1) * 100);
  }, [pool, positionData, quoteClosePositionResult.data]);

  const form = useForm({
    defaultValues: {
      size: '0',
      tradeDirection: 'Long',
      slippage: '0.5',
      fetchingSizeFromCollateralInput: false,
      isClosePosition: false,
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
    watch,
  } = form;

  // Watch slippage value from form
  const formSlippage = watch('slippage');
  const fetchingSizeFromCollateralInput = watch(
    'fetchingSizeFromCollateralInput'
  );

  // Calculate collateralDeltaLimit using watched slippage value
  const collateralDeltaLimit = useMemo(() => {
    if (quotedCollateralDelta === BigInt(0)) return BigInt(0);

    const slippageValue = Number(formSlippage); // Convert to number
    const slippageMultiplier = BigInt(Math.floor((100 + slippageValue) * 100));
    const slippageReductionMultiplier = BigInt(
      Math.floor((100 - slippageValue) * 100)
    );

    if (quotedCollateralDelta > BigInt(0)) {
      return (quotedCollateralDelta * slippageMultiplier) / BigInt(10000);
    }

    return (
      (quotedCollateralDelta * slippageReductionMultiplier) / BigInt(10000)
    );
  }, [quotedCollateralDelta, formSlippage]);

  // Update handleSubmit to use form values
  const onSubmit = async (values: any) => {
    if (!isConnected) {
      return;
    }

    setPendingTxn(true);

    if (requireApproval) {
      approveWrite({
        abi: erc20ABI as AbiFunction[],
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [marketAddress, collateralDeltaLimit],
      });
      setTxnStep(1);
    } else if (isEdit) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      // Handle close button case
      const callSizeInContractUnit = values.isClosePosition
        ? BigInt(0)
        : desiredSizeInContractUnit;
      const callCollateralDeltaLimit = values.isClosePosition
        ? BigInt(0)
        : collateralDeltaLimit;
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'modifyTraderPosition',
        args: [
          nftId,
          callSizeInContractUnit,
          callCollateralDeltaLimit,
          deadline,
        ],
      });
      setTxnStep(2);
    } else {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'createTraderPosition',
        args: [
          epoch,
          desiredSizeInContractUnit,
          collateralDeltaLimit,
          deadline,
        ],
      });
      setTxnStep(2);
    }
  };

  // Update resetAfterSuccess to reset form values properly
  const resetAfterSuccess = async () => {
    reset({
      size: '0',
      tradeDirection: 'Long',
      slippage: '0.5',
      fetchingSizeFromCollateralInput: false,
      isClosePosition: false,
    });
    setSizeChange(BigInt(0));
    setPendingTxn(false);
    setTxnStep(0);
    await Promise.all([
      refreshPositions(),
      refetchAllowance(),
      refetchPositionData(),
      refetchUniswapData(),
    ]);
  };

  useEffect(() => {
    if (collateralBalance) {
      const newWalletBalance = formatUnits(
        collateralBalance as bigint,
        collateralAssetDecimals
      );
      setWalletBalance(newWalletBalance);

      const newQuotedResultingWalletBalance = formatUnits(
        (collateralBalance as bigint) - quotedCollateralDelta,
        collateralAssetDecimals
      );
      setQuotedResultingWalletBalance(newQuotedResultingWalletBalance);

      const newWalletBalanceLimit =
        parseUnits(newWalletBalance, collateralAssetDecimals) -
        collateralDeltaLimit;
      setWalletBalanceLimit(newWalletBalanceLimit);
    }

    const newPositionCollateralLimit =
      (positionData?.depositedCollateralAmount || BigInt(0)) +
      collateralDeltaLimit;
    setPositionCollateralLimit(newPositionCollateralLimit);

    const newResultingPositionCollateral =
      (positionData?.depositedCollateralAmount || BigInt(0)) +
      quotedCollateralDelta;
    setResultingPositionCollateral(newResultingPositionCollateral);
  }, [
    collateralBalance,
    collateralAssetDecimals,
    collateralDeltaLimit,
    positionData,
  ]);

  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();

  const { setIsOpen } = useConnectWallet();

  const handleTabChange = (value: string) => {
    setTradeDirection(value as 'Long' | 'Short');
  };

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <Button
          className="w-full mb-4"
          size="lg"
          onClick={() => setIsOpen(true)}
        >
          Connect Wallet
        </Button>
      );
    }

    if (currentChainId !== chainId) {
      return (
        <Button
          className="w-full mb-4"
          variant="default"
          size="lg"
          onClick={() => switchChain({ chainId })}
        >
          Switch Network
        </Button>
      );
    }

    const isFetchingQuote = isEdit
      ? quoteModifyPositionResult.isFetching
      : quoteCreatePositionResult.isFetching;
    const isLoading =
      pendingTxn ||
      fetchingSizeFromCollateralInput ||
      isLoadingCollateralChange ||
      (isNonZeroSizeChange && isFetchingQuote);

    let buttonTxt = isEdit ? 'Update Position' : 'Create Position';
    if (desiredSizeInContractUnit === BigInt(0) && isNonZeroSizeChange) {
      buttonTxt = 'Close Position';
    }
    if (requireApproval) {
      buttonTxt = `Approve ${collateralAssetTicker} Transfer`;
    }
    if (isFetchingQuote && !formError) {
      buttonTxt = 'Generating Quote...';
    }
    if (fetchingSizeFromCollateralInput) {
      buttonTxt = 'Generating Quote....';
    }
    return (
      <div className="mb-4">
        <Button
          className="w-full"
          variant="default"
          type="submit"
          disabled={
            !!formError || isLoading || sizeChangeInContractUnit === BigInt(0)
          }
          size="lg"
        >
          {isLoading && !formError ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : null}
          {buttonTxt}
        </Button>
        {renderPriceImpactWarning()}
      </div>
    );
  };

  const renderCloseButton = () => {
    if (!isEdit || !isConnected || currentChainId !== chainId) return null;

    const positionHasBalance =
      positionData &&
      (positionData.vGasAmount > BigInt(0) ||
        positionData.borrowedVGas > BigInt(0));
    if (!positionHasBalance) return null;

    const isFetchingQuote = quoteModifyPositionResult.isFetching;
    const isLoading =
      pendingTxn ||
      fetchingSizeFromCollateralInput ||
      isLoadingCollateralChange ||
      (isNonZeroSizeChange && isFetchingQuote);

    let buttonTxt = 'Close Position';

    if (requireApproval) {
      buttonTxt = `Approve ${collateralAssetTicker} transfer to close position`;
    }

    if (isFetchingQuote && !formError) return null;
    if (fetchingSizeFromCollateralInput) return null;

    return (
      <div className="mb-4 text-center -mt-2">
        <div className="flex items-center justify-center gap-1">
          {closePositionPriceImpact > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm font-medium">
                    Closing this position will have a{' '}
                    {Number(closePositionPriceImpact.toFixed(2))}% price impact
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <button
            onClick={() => setValue('isClosePosition', true)}
            className="text-sm underline hover:opacity-80 disabled:opacity-50"
            type="submit"
            disabled={!!formError || isLoading}
          >
            {buttonTxt}
          </button>
        </div>
      </div>
    );
  };

  const findSizeForCollateral = async () => {
    if (!collateralInput || collateralInput === BigInt(0)) return;

    // Start with an initial guess based on current price
    const targetCollateral = collateralInput;
    let currentSize = BigInt(0);
    let bestSize = BigInt(0);
    let bestDiff = targetCollateral;
    let iterations = 0;
    const maxIterations = 10;

    // Binary search parameters
    let low = BigInt(0);
    let high = (targetCollateral * BigInt(2)) / BigInt(1e9);
    setValue('fetchingSizeFromCollateralInput', true);

    while (low <= high && iterations < maxIterations) {
      currentSize = (low + high) / BigInt(2);
      const sizeInContractUnits =
        currentSize * BigInt(1e9) * (isLong ? BigInt(1) : BigInt(-1));

      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await publicClient?.simulateContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: isEdit
            ? 'quoteModifyTraderPosition'
            : 'quoteCreateTraderPosition',
          args: isEdit
            ? [nftId, sizeInContractUnits]
            : [epoch, sizeInContractUnits],
          account: address || zeroAddress,
        });

        if (!result?.result) break;

        const [quotedCollateral] = result.result;
        const quotedCollateralBigInt = BigInt(quotedCollateral.toString());
        const diff =
          quotedCollateralBigInt > targetCollateral
            ? quotedCollateralBigInt - targetCollateral
            : targetCollateral - quotedCollateralBigInt;

        if (diff < bestDiff) {
          bestDiff = diff;
          bestSize = currentSize;
        }

        if (quotedCollateralBigInt > targetCollateral) {
          high = currentSize - BigInt(1);
        } else {
          low = currentSize + BigInt(1);
        }
      } catch (error) {
        high = currentSize - BigInt(1);
      }

      iterations++;
    }

    if (bestSize <= BigInt(0)) {
      setQuoteError('Could not find a size that matches your collateral');
    }

    setSizeChange(bestSize);
    setValue('fetchingSizeFromCollateralInput', false);
  };

  // Debounce the search to avoid too many calls
  const debouncedFindSize = useMemo(
    () => debounce(findSizeForCollateral, 500),
    [collateralInput, isEdit, originalPositionSizeInContractUnit]
  );

  useEffect(() => {
    if (collateralInput > BigInt(0)) {
      debouncedFindSize();
    }
    return () => {
      debouncedFindSize.cancel();
    };
  }, [collateralInput, debouncedFindSize]);

  const handleCollateralAmountChange = (amount: bigint) => {
    setCollateralInput(amount);
  };

  const publicClient = usePublicClient();

  const renderPriceImpactWarning = () => {
    if (!showPriceImpactWarning) return null;
    return (
      <p className="text-red-500 text-sm text-center mt-1 font-medium">
        <AlertTriangle className="inline-block w-4 h-4 mr-1" />
        Very high price impact ({Number(priceImpact.toFixed(2)).toString()}%)
      </p>
    );
  };

  const requireApproval: boolean = useMemo(() => {
    return !allowance || collateralDeltaLimit > (allowance as bigint);
  }, [allowance, collateralDeltaLimit]);

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <h2 className="text-2xl font-semibold mb-3">Trade</h2>

        <Tabs
          defaultValue="Long"
          value={tradeDirection || 'Long'}
          onValueChange={handleTabChange}
          className="mb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="Long">Long</TabsTrigger>
            <TabsTrigger value="Short">Short</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mb-4">
          <div className={errors.size ? 'space-y-1' : ''}>
            <div className="relative flex">
              <SizeInput
                nftId={nftId}
                setSize={setSizeChange}
                isLong={isLong}
                positionData={positionData}
                error={formError}
                defaultToGas={false}
                allowCollateralInput
                collateralAssetTicker={collateralAssetTicker}
                onCollateralAmountChange={handleCollateralAmountChange}
                fixedUnit={market?.isCumulative}
                {...register('size', {
                  onChange: (e) => {
                    const processed = removeLeadingZeros(e.target.value);
                    setValue('size', processed, {
                      shouldValidate: true,
                    });
                  },
                  validate: (value) => {
                    if (value === '') return 'Size is required';
                    return true;
                  },
                })}
              />
            </div>
            {errors.size && (
              <p className="text-sm text-destructive">
                {errors.size.message?.toString()}
              </p>
            )}
          </div>
        </div>

        <SlippageTolerance />
        {renderActionButton()}
        {renderCloseButton()}

        <div className="flex flex-col gap-2">
          <PositionSelector />
          {isEdit && (
            <div>
              <p className="text-sm  font-semibold mb-0.5">Position Size</p>
              <p className="text-sm  mb-0.5">
                <NumberDisplay
                  value={formatUnits(
                    originalPositionSizeInContractUnit,
                    TOKEN_DECIMALS
                  )}
                />{' '}
                {unitDisplay(false)}
                {isNonZeroSizeChange && (
                  <>
                    {' '}
                    →{' '}
                    <NumberDisplay
                      value={formatUnits(
                        desiredSizeInContractUnit,
                        TOKEN_DECIMALS
                      )}
                    />{' '}
                    {unitDisplay(false)}
                  </>
                )}
              </p>
            </div>
          )}
          {!isLoadingCollateralChange && isConnected && (
            <div>
              <p className="text-sm font-semibold mb-0.5">Wallet Balance</p>
              <p className="text-sm ">
                <NumberDisplay value={walletBalance} /> {collateralAssetTicker}
                {sizeChange !== BigInt(0) && !quoteError && (
                  <>
                    {' '}
                    → <NumberDisplay
                      value={quotedResultingWalletBalance}
                    />{' '}
                    {collateralAssetTicker} (Min.{' '}
                    <NumberDisplay
                      value={formatUnits(
                        walletBalanceLimit,
                        collateralAssetDecimals
                      )}
                    />{' '}
                    {collateralAssetTicker})
                  </>
                )}
              </p>
            </div>
          )}
          {!isLoadingCollateralChange &&
            (isEdit || sizeChange !== BigInt(0)) && (
              <div>
                <p className="text-sm  font-semibold mb-0.5">
                  Position Collateral
                </p>
                <p className="text-sm  mb-0.5">
                  <NumberDisplay
                    value={formatUnits(
                      positionData?.depositedCollateralAmount || BigInt(0),
                      collateralAssetDecimals
                    )}
                  />{' '}
                  {collateralAssetTicker}
                  {sizeChange !== BigInt(0) && !quoteError && (
                    <>
                      {' '}
                      →{' '}
                      <NumberDisplay
                        value={formatUnits(
                          resultingPositionCollateral,
                          collateralAssetDecimals
                        )}
                      />{' '}
                      {collateralAssetTicker} (Max.{' '}
                      <NumberDisplay
                        value={formatUnits(
                          positionCollateralLimit,
                          collateralAssetDecimals
                        )}
                      />{' '}
                      {collateralAssetTicker})
                    </>
                  )}
                </p>
              </div>
            )}
          {quotedFillPrice && (
            <div>
              <p className="text-sm  font-semibold mb-0.5">
                Estimated Fill Price
              </p>
              <p className="text-sm  mb-0.5">
                <NumberDisplay
                  value={
                    useMarketUnits || market?.isCumulative
                      ? formatUnits(
                          quotedFillPrice || BigInt(0),
                          TOKEN_DECIMALS
                        )
                      : Number(
                          formatUnits(
                            quotedFillPrice || BigInt(0),
                            TOKEN_DECIMALS
                          )
                        ) * convertGgasPerWstEthToGwei(1, stEthPerToken)
                  }
                />{' '}
                {unitDisplay()}
              </p>
            </div>
          )}
          {priceImpact !== 0 && (
            <div>
              <p className="text-sm  font-semibold mb-0.5">
                Estimated Price Impact
              </p>
              <p
                className={`${showPriceImpactWarning ? 'text-red-500' : ''} text-sm font-medium mb-0.5`}
              >
                {Number(priceImpact.toFixed(2)).toString()}%
              </p>
            </div>
          )}
        </div>
      </form>
    </Form>
  );
}

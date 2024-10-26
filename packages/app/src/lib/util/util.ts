import type { ToastId, UseToastOptions } from '@chakra-ui/react';
import {
  formatEther,
  type ReadContractErrorType,
  type WriteContractErrorType,
} from 'viem';
import * as chains from 'viem/chains';

import { TimeWindow } from '../interfaces/interfaces';

export const renderContractErrorToast = (
  error: ReadContractErrorType | WriteContractErrorType | null,
  toast: (options?: UseToastOptions) => ToastId,
  desc: string
) => {
  if (error) {
    console.error(desc, error.message);
    toast({
      title: desc,
      description: error.message,
      status: 'error',
      duration: 5000,
      isClosable: true,
    });
  }
};

export const renderToast = (
  toast: (options?: UseToastOptions) => ToastId,
  desc: string,
  status?: 'info' | 'warning' | 'success' | 'error' | 'loading'
) => {
  toast({
    title: desc,
    status: status || 'success',
    duration: 5000,
    isClosable: true,
  });
};

export function convertHundredthsOfBipToPercent(
  hundredthsOfBip: number
): number {
  // 1 bip = 0.01%
  // 1 hundredth of bip = 0.01/100 = 0.0001
  return (hundredthsOfBip * 0.0001) / 100;
}

export function getDisplayTextForVolumeWindow(volumeWindow: TimeWindow) {
  if (volumeWindow === TimeWindow.H) {
    return 'Past Hour';
  }
  if (volumeWindow === TimeWindow.D) {
    return 'Past Day';
  }
  if (volumeWindow === TimeWindow.W) {
    return 'Past Week';
  }
  if (volumeWindow === TimeWindow.M) {
    return 'Past Month';
  }
  if (volumeWindow === TimeWindow.Y) {
    return 'Past Year';
  }
  return '';
}

// TODO: Adjust this based on fee rate on the market
export const tickToPrice = (tick: number): number => 1.0001 ** tick;

export function getChain(chainId: number) {
  for (const chain of Object.values(chains)) {
    if (chain.id === chainId) {
      return chain;
    }
  }

  throw new Error(`Chain with id ${chainId} not found`);
}

export const convertToGwei = (
  value: number,
  stEthPerToken: number | undefined
) => {
  return (value * (stEthPerToken || 1)) / 1e9;
};

export const gweiToEther = (gweiValue: bigint): string => {
  // First, convert gwei to wei (multiply by 10^9)
  const weiValue = gweiValue * BigInt(1e9);
  // Then use formatEther to convert wei to ether
  return formatEther(weiValue);
};

export const shortenAddress = (address: string) => {
  if (address.length < 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

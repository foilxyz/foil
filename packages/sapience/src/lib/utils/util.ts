import JSBI from 'jsbi';
import { formatEther, createPublicClient, http } from 'viem';
import type { Chain } from 'viem/chains';
import * as chains from 'viem/chains';
import { mainnet } from 'viem/chains';

import type { FoilPosition } from '../interfaces/interfaces';
import { TimeWindow } from '../interfaces/interfaces';

export const foilApi = {
  baseUrl: process.env.NEXT_PUBLIC_FOIL_API_URL || '',
  token: process.env.NEXT_PUBLIC_FOIL_API_TOKEN,

  getHeaders() {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  },

  async post(path: string, body: any) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    return response.json();
  },

  async get(path: string) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    return response.json();
  },
};

// Mainnet client for ENS resolution and stEthPerToken query
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? http(
        `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      )
    : http('https://ethereum-rpc.publicnode.com'),
});

export function convertHundredthsOfBipToPercent(
  hundredthsOfBip: number
): number {
  // 1 bip = 0.01%
  // 1 hundredth of bip = 0.01/100 = 0.0001
  return (hundredthsOfBip * 0.0001) / 100;
}

export function getDisplayTextForVolumeWindow(volumeWindow: TimeWindow) {
  if (volumeWindow === TimeWindow.D) {
    return 'Past Day';
  }
  if (volumeWindow === TimeWindow.W) {
    return 'Past Week';
  }
  if (volumeWindow === TimeWindow.M) {
    return 'Past Month';
  }
  return '';
}

// TODO: Adjust this based on fee rate on the market
export const tickToPrice = (tick: number): number => 1.0001 ** tick;

export function getChain(chainId: number): Chain {
  for (const chain of Object.values(chains)) {
    if (chain.id === chainId) {
      return chain;
    }
  }

  throw new Error(`Chain with id ${chainId} not found`);
}

export const convertGgasPerWstEthToGwei = (
  wstEth: number,
  wstEthinEth: number | undefined
) => {
  // wstEthinEth = (how many ETH in wstETH) * 1e9; units = wstETH / ETH
  // For Ggas/wstETH to gwei:
  // 1. Remove redundant decimals from wstEthinEth by dividing it by 1e9
  // 2. Convert Ggas/wstETH to gas/gwei by multiplying by wstEthinEth
  // Explanation to 2: GGas/stETH == gas/gwei, just need to remove the wstETH part
  return wstEth * ((wstEthinEth || 1e9) / 1e9);
};

export const gweiToEther = (gweiValue: bigint): string => {
  // First, convert gwei to wei (multiply by 10^9)
  const weiValue = gweiValue * BigInt(1e9);
  // Then use formatEther to convert wei to ether as a string
  return formatEther(weiValue);
};

export const shortenAddress = (address: string) => {
  if (address.length < 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Removes leading zeros from a string or number input while preserving valid number format
 * @param input - The input string or number to process
 * @returns A string with leading zeros removed while maintaining decimal points and negative signs
 */
export const removeLeadingZeros = (input: string | number): string => {
  // Convert input to string if it's a number
  const str = input.toString();

  // Handle empty string
  if (!str) return str;

  // Handle zero
  if (str === '0') return '0';

  // Handle decimal numbers starting with 0 (e.g., 0.123)
  if (str.match(/^0\./)) return str;

  // Handle negative numbers
  if (str.startsWith('-')) {
    const withoutMinus = str.slice(1);
    const processed = removeLeadingZeros(withoutMinus);
    return processed === '0' ? '0' : `-${processed}`;
  }

  // Remove leading zeros and return
  return str.replace(/^0+/, '') || '0';
};

export function JSBIAbs(value: JSBI): JSBI {
  return JSBI.lessThan(value, JSBI.BigInt(0))
    ? JSBI.multiply(value, JSBI.BigInt(-1))
    : value;
}

export const convertToSqrtPriceX96 = (priceD18: number) => {
  const Q96 = BigInt('0x1000000000000000000000000');
  return BigInt(Math.floor(Math.sqrt(priceD18) * Number(Q96)));
};

export const getExplorerUrl = (chainId: number, address: string) => {
  const chain = Object.values(chains).find((c) => c.id === chainId);
  return chain?.blockExplorers?.default?.url
    ? `${chain.blockExplorers.default.url}/address/${address}`
    : `https://etherscan.io/address/${address}`;
};

export const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

// checks if an nft position has a balance
export const positionHasBalance = (position: FoilPosition): boolean => {
  return Number(position.vEthAmount) > 0 || Number(position.vGasAmount) > 0;
};

export const formatNumber = (value: number, decimals: number = 2): string => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

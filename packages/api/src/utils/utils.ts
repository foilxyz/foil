import {
  Block,
  PublicClient,
  createPublicClient,
  formatUnits,
  http,
  webSocket,
  type Transport,
} from 'viem';
import { mainnet, sepolia, cannon, base, arbitrum } from 'viem/chains';
import { TOKEN_PRECISION } from '../constants';
import { marketRepository } from '../db';
import { Deployment } from '../interfaces';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as viem from 'viem';
import * as viemChains from 'viem/chains';
import * as Sentry from '@sentry/node';

export const chains: viem.Chain[] = [...Object.values(viemChains)];

export function getChainById(id: number): viem.Chain | undefined {
  const chain = viem.extractChain({
    chains,
    id,
  });

  if (chain) return chain;
}

// Replace __dirname reference with this
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const clientMap = new Map<number, PublicClient>();

// added reconnection configurations from viem.
const createInfuraWebSocketTransport = (network: string): Transport => {
  if (!process.env.INFURA_API_KEY) {
    return http();
  }

  console.log(`[${network}] Creating WebSocket connection...`);

  return webSocket(
    `wss://${network}.infura.io/ws/v3/${process.env.INFURA_API_KEY}`,
    {
      key: network,
      reconnect: {
        attempts: 5,
        delay: 1000,
      },
      retryCount: 5,
      timeout: 30000,
      keepAlive: true,
    }
  );
};

const createChainClient = (
  chain: viem.Chain,
  network: string,
  useLocalhost = false
) =>
  createPublicClient({
    chain,
    transport: useLocalhost
      ? http('http://localhost:8545')
      : process.env.INFURA_API_KEY
        ? createInfuraWebSocketTransport(network)
        : http(),
    batch: {
      multicall: true,
    },
  });

export const mainnetPublicClient = createChainClient(mainnet, 'mainnet');
export const basePublicClient = createChainClient(base, 'base-mainnet', true);
export const sepoliaPublicClient = createChainClient(sepolia, 'sepolia');
export const cannonPublicClient = createChainClient(cannon, 'cannon', true);
export const arbitrumPublicClient = createChainClient(
  arbitrum,
  'arbitrum-mainnet'
);

export function getProviderForChain(chainId: number): PublicClient {
  if (clientMap.has(chainId)) {
    return clientMap.get(chainId)!;
  }

  let newClient: PublicClient;

  switch (chainId) {
    case 1:
      newClient = mainnetPublicClient;
      break;
    case 11155111:
      newClient = sepoliaPublicClient;
      break;
    case 13370:
      newClient = cannonPublicClient;
      break;
    case 8453:
      newClient = basePublicClient as PublicClient;
      break;
    case 42161:
      newClient = arbitrumPublicClient as PublicClient;
      break;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  clientMap.set(chainId, newClient);

  return newClient;
}

/**
 * Format a BigInt value from the DB to a string with 3 decimal places.
 * @param value - a string representation of a BigInt value
 * @returns a string representation of the value with 3 decimal places
 */
export const formatDbBigInt = (value: string) => {
  if (Number(value) === 0) {
    return '0';
  }
  const formatted = formatUnits(BigInt(value), TOKEN_PRECISION);
  return formatted;
};

export const bigintReplacer = (key: string, value: unknown) => {
  if (typeof value === 'bigint') {
    return value.toString(); // Convert BigInt to string
  }
  return value;
};

export const getTimestampsForReindex = async (
  client: PublicClient,
  contractDeployment: Deployment,
  chainId: number,
  epochId?: number
) => {
  const now = Math.round(new Date().getTime() / 1000);

  // if no epoch is provided, get the latest one from the contract
  if (!epochId) {
    const latestEpoch = (await client.readContract({
      address: contractDeployment.address.toLowerCase() as `0x${string}`,
      abi: contractDeployment.abi,
      functionName: 'getLatestEpoch',
    })) as [number, number, number];
    epochId = Number(latestEpoch[0]);
    return {
      startTimestamp: Number(latestEpoch[1]),
      endTimestamp: Math.min(Number(latestEpoch[2]), now),
    };
  }

  // get info from database
  const market = await marketRepository.findOne({
    where: {
      marketId: epochId,
      marketGroup: {
        address: contractDeployment.address.toLowerCase(),
        chainId,
      },
    },
    relations: ['marketGroup'],
  });

  if (!market || !market.startTimestamp || !market.endTimestamp) {
    // get info from contract
    console.log('fetching epoch from contract to get timestamps...');
    const epochContract = (await client.readContract({
      address: contractDeployment.address.toLowerCase() as `0x${string}`,
      abi: contractDeployment.abi,
      functionName: 'getEpoch',
      args: [`${epochId}`],
    })) as [number, number, number];
    return {
      startTimestamp: Number(epochContract[0]),
      endTimestamp: Math.min(Number(epochContract[1]), now),
    };
  }

  return {
    startTimestamp: Number(market.startTimestamp),
    endTimestamp: Math.min(Number(market.endTimestamp), now),
  };
};

export async function getBlockRanges(
  startTimestamp: number,
  endTimestamp: number,
  publicClient: PublicClient
) {
  console.log('Getting gas start...');
  const gasStart = await getBlockByTimestamp(
    mainnetPublicClient,
    startTimestamp
  );
  console.log(`Got gas start: ${gasStart.number}. Getting gas end...`);

  const gasEnd =
    (await getBlockByTimestamp(mainnetPublicClient, endTimestamp)) ||
    (await mainnetPublicClient.getBlock());
  console.log(`Got gas end:  ${gasEnd.number}.  Getting market start....`);

  const marketStart = await getBlockByTimestamp(publicClient, startTimestamp);
  console.log(
    `Got market start: ${marketStart.number}. Getting market end....`
  );

  const marketEnd =
    (await getBlockByTimestamp(publicClient, endTimestamp)) ||
    (await publicClient.getBlock());
  console.log(
    `Got market end: ${marketEnd.number}. Finished getting block ranges.`
  );

  return {
    gasStart: gasStart.number,
    gasEnd: gasEnd.number,
    marketStart: marketStart.number,
    marketEnd: marketEnd.number,
  };
}

export async function getBlockByTimestamp(
  client: PublicClient,
  timestamp: number
): Promise<Block> {
  // Get the latest block number
  const latestBlockNumber = await client.getBlockNumber();

  // Get the latest block to check its timestamp
  const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber });

  // If the requested timestamp is in the future, return the latest block
  if (timestamp > Number(latestBlock.timestamp)) {
    console.log(
      `Requested timestamp ${timestamp} is in the future. Using latest block ${latestBlockNumber} with timestamp ${latestBlock.timestamp} instead.`
    );
    return latestBlock;
  }

  // Initialize the binary search range
  let low = 0n;
  let high = latestBlockNumber;
  let closestBlock: Block | null = null;

  // Binary search for the block with the closest timestamp
  while (low <= high) {
    const mid = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: mid });

    if (block.timestamp < timestamp) {
      low = mid + 1n;
    } else {
      high = mid - 1n;
      closestBlock = block;
    }
  }

  // If the closest block's timestamp is greater than the given timestamp, it is our match
  // Otherwise, we need to get the next block (if it exists)
  if (closestBlock?.number && closestBlock.timestamp < timestamp) {
    const nextBlock = await client.getBlock({
      blockNumber: closestBlock.number + 1n,
    });
    if (nextBlock) {
      closestBlock = nextBlock;
    }
  }

  return closestBlock!;
}

export async function getBlockBeforeTimestamp(
  client: PublicClient,
  timestamp: number
): Promise<Block> {
  const latestBlockNumber = await client.getBlockNumber();
  const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber });

  let low = 0n;
  let high = latestBlock.number;
  let closestBlock: Block | null = null;

  // Binary search for the block with the closest timestamp
  while (low <= high) {
    const mid = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: mid });

    if (block.timestamp <= timestamp) {
      // If this block is before or at our target time,
      // it's a candidate for closest block
      closestBlock = block;
      low = mid + 1n; // Look in upper half for a closer block
    } else {
      // If this block is after our target time,
      // look in the lower half
      high = mid - 1n;
    }
  }

  if (!closestBlock) {
    throw new Error('No block found before timestamp');
  }

  return closestBlock;
}

/**
 * Converts settlementSqrtPriceX96 to settlementPriceD18
 * @param settlementSqrtPriceX96 sqrt price in X96 format as bigint
 * @returns bigint price with 18 decimals
 */
export function sqrtPriceX96ToSettlementPriceD18(
  settlementSqrtPriceX96: bigint
): bigint {
  // First divide by 2^96 to get sqrt price
  const sqrtPrice = settlementSqrtPriceX96 / BigInt(2 ** 96);

  // Square the price
  const price = sqrtPrice * sqrtPrice;

  // Convert to D18 by multiplying by 10^18
  return price * BigInt(10 ** 18);
}

export const convertGasToGgas = (value: string) => {
  const integerPart: string = (BigInt(value) / BigInt(1e9)).toString();
  // decimal part = prefix of zeros if gas is < 10^9, then the useful decimals
  if (BigInt(value) % BigInt(1e9) !== BigInt(0)) {
    const decimalPart: string =
      '0'.repeat(
        Math.max(9 - (BigInt(value) % BigInt(1e9)).toString().length, 0)
      ) + (BigInt(value) % BigInt(1e9)).toString().replace(/0+$/, '');
    return `${integerPart}.${decimalPart}`;
  }
  return integerPart;
};

export const convertGgasToGas = (value: string) => {
  // case when we have decimals
  if (value.indexOf('.') > -1) {
    const [integerPart, decimalPart]: string[] = value.split('.');
    // console.log(`Integer part: ${integerPart}, decimal part: ${decimalPart}`);
    return (
      BigInt(integerPart) * BigInt(1e9) +
      BigInt(decimalPart) * BigInt(10 ** (9 - decimalPart.length))
    ).toString();
  } // else if the whole number is an integer
  return (BigInt(value) * BigInt(1e9)).toString();
};

export async function fetchRenderServices() {
  const RENDER_API_KEY = process.env.RENDER_API_KEY;
  if (!RENDER_API_KEY) {
    throw new Error('RENDER_API_KEY not set');
  }
  const url = 'https://api.render.com/v1/services?limit=100';
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${RENDER_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
}

export async function createRenderJob(serviceId: string, startCommand: string) {
  const RENDER_API_KEY = process.env.RENDER_API_KEY;
  if (!RENDER_API_KEY) {
    throw new Error('RENDER_API_KEY not set');
  }

  const url = `https://api.render.com/v1/services/${serviceId}/jobs`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startCommand: startCommand,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
}

export const sleep = async (ms: number) => {
  return await new Promise((resolve) => setTimeout(resolve, ms));
};

export const CELENIUM_API_KEY = process.env.CELENIUM_API_KEY;

/**
 * Get the block and timestamp when a contract was created
 * @param client - The viem PublicClient to use for blockchain queries
 * @param contractAddress - The address of the contract to find creation info for
 * @returns An object containing the block and timestamp when the contract was created
 */
export async function getContractCreationBlock(
  client: PublicClient,
  contractAddress: string
): Promise<{ block: Block; timestamp: number }> {
  // Get the contract code at the latest block
  const latestBlockNumber = await client.getBlockNumber();
  const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber });

  // Check if the contract exists at the latest block
  const code = await client.getBytecode({
    address: contractAddress as `0x${string}`,
  });

  if (!code) {
    throw new Error(
      `Contract at address ${contractAddress} not found at the latest block`
    );
  }

  // Initialize the binary search range
  let low = 0n;
  let high = latestBlockNumber;
  let creationBlock: Block | null = null;

  // Binary search to find the earliest block where the contract exists
  while (low <= high) {
    const mid = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: mid });

    try {
      // Check if the contract exists at this block
      const codeAtBlock = await client.getBytecode({
        address: contractAddress as `0x${string}`,
        blockNumber: mid,
      });

      if (codeAtBlock) {
        // Contract exists at this block, so it was created before or at this block
        creationBlock = block;
        high = mid - 1n; // Look in lower half for earlier creation
      } else {
        // Contract doesn't exist at this block, so it was created after this block
        low = mid + 1n; // Look in upper half
      }
    } catch (error) {
      // If there's an error (e.g., node not synced to this block), try a different approach
      console.warn(`Error checking block ${mid}: ${error}`);
      // Fall back to a more conservative approach
      high = mid - 1n;
    }
  }

  // If we found a block where the contract exists, get the next block to find the exact creation block
  if (creationBlock) {
    // The contract was created in the block after the one we found
    if (creationBlock.number !== undefined && creationBlock.number !== null) {
      const creationBlockNumber = creationBlock.number + 1n;

      // Make sure we don't go beyond the latest block
      if (creationBlockNumber <= latestBlockNumber) {
        const exactCreationBlock = await client.getBlock({
          blockNumber: creationBlockNumber,
        });
        return {
          block: exactCreationBlock,
          timestamp: Number(exactCreationBlock.timestamp),
        };
      }
    }
  }

  // If we couldn't find the creation block, return the latest block as a fallback
  return {
    block: latestBlock,
    timestamp: Number(latestBlock.timestamp),
  };
}

const MAX_RETRIES = Infinity;
const RETRY_DELAY = 5000; // 5 seconds

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  operation: () => Promise<T>,
  name: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Attempt ${attempt}/${maxRetries} failed for ${name}:`,
        error
      );

      // Report error to Sentry with context
      Sentry.withScope((scope) => {
        scope.setExtra('attempt', attempt);
        scope.setExtra('maxRetries', maxRetries);
        scope.setExtra('operationName', name);
        Sentry.captureException(error);
      });

      if (attempt < maxRetries) {
        console.log(`Retrying ${name} in ${RETRY_DELAY / 1000} seconds...`);
        await delay(RETRY_DELAY);
      }
    }
  }
  const finalError = new Error(
    `All ${maxRetries} attempts failed for ${name}. Last error: ${lastError?.message}`
  );
  Sentry.captureException(finalError);
  throw finalError;
}

export function createResilientProcess<T>(
  process: () => Promise<T>,
  name: string
): () => Promise<T | void> {
  return async () => {
    while (true) {
      try {
        // Use the `withRetry` from this module
        return await withRetry(process, name);
      } catch (error) {
        console.error(
          `Process ${name} failed after all retries. Restarting...`,
          error
        );
        // Use the `delay` from this module and the RETRY_DELAY constant
        await delay(RETRY_DELAY);
      }
    }
  };
}

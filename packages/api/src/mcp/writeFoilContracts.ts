import { encodeFunctionData } from 'viem';
// import { base } from 'viem/chains';
// import { createPublicClient, http } from 'viem';
import SapienceABI from '@sapience/protocol/deployments/Sapience.json';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';

// Create a public client for interacting with the blockchain
// const client = createPublicClient({
//   chain: base,
//   transport: process.env.TRANSPORT_URL
//     ? http(process.env.TRANSPORT_URL)
//     : http(),
// });

// Helper function to encode function data
function encodeFunction(
  functionName: string,
  args:
    | (string | number | bigint | boolean)[]
    | Record<string, string | number | bigint | boolean>
) {
  return encodeFunctionData({
    abi: SapienceABI.abi,
    functionName,
    args: Array.isArray(args) ? args : [args],
  });
}

export const createTraderPosition = {
  name: 'create_sapience_trader_position',
  description: 'Creates a new trader position with specified parameters',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group to create the position in'),
      marketId: z.string().describe('The market ID to create the position in'),
      collateralAmount: z.string().describe('The amount of collateral to use'),
      size: z.string().describe('The size of the position'),
      deadline: z
        .string()
        .describe('The deadline for the transaction (timestamp in seconds)'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    marketId: string;
    collateralAmount: string;
    size: string;
    deadline: string;
  }): Promise<CallToolResult> => {
    try {
      const calldata = encodeFunction('createTraderPosition', [
        BigInt(args.marketId),
        BigInt(args.size),
        BigInt(args.collateralAmount),
        BigInt(args.deadline),
      ]);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding createTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const modifyTraderPosition = {
  name: 'modify_sapience_trader_position',
  description: 'Modifies an existing trader position with new parameters',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      positionId: z.string().describe('The ID of the position to modify'),
      newSize: z.string().describe('The new size of the position'),
      deltaCollateralLimit: z
        .string()
        .describe(
          'The change in the collateral limit. Positive for adding collateral, negative for removing. If 0, no limit.'
        ),
      deadline: z
        .string()
        .describe('The deadline for the transaction (timestamp in seconds)'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
    newSize: string;
    deltaCollateralLimit: string;
    deadline: string;
  }): Promise<CallToolResult> => {
    try {
      const calldata = encodeFunction('modifyTraderPosition', [
        BigInt(args.positionId),
        BigInt(args.newSize),
        BigInt(args.deltaCollateralLimit),
        BigInt(args.deadline),
      ]);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding modifyTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const createLiquidityPosition = {
  name: 'create_sapience_liquidity_position',
  description: 'Creates a new liquidity position with specified parameters',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group to create the position in'),
      marketId: z.string().describe('The market ID to create the position in'),
      amountTokenA: z.string().describe('The amount of token A to add'),
      amountTokenB: z.string().describe('The amount of token B to add'),
      collateralAmount: z.string().describe('The amount of collateral to use'),
      lowerTick: z.string().describe('The lower tick of the position range'),
      upperTick: z.string().describe('The upper tick of the position range'),
      minAmountTokenA: z
        .string()
        .describe('The minimum amount of token A to add'),
      minAmountTokenB: z
        .string()
        .describe('The minimum amount of token B to add'),
      deadline: z
        .string()
        .describe('The deadline for the transaction (timestamp in seconds)'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    marketId: string;
    amountTokenA: string;
    amountTokenB: string;
    collateralAmount: string;
    lowerTick: string;
    upperTick: string;
    minAmountTokenA: string;
    minAmountTokenB: string;
    deadline: string;
  }): Promise<CallToolResult> => {
    try {
      const params = {
        marketId: BigInt(args.marketId),
        amountTokenA: BigInt(args.amountTokenA),
        amountTokenB: BigInt(args.amountTokenB),
        collateralAmount: BigInt(args.collateralAmount),
        lowerTick: Number(args.lowerTick),
        upperTick: Number(args.upperTick),
        minAmountTokenA: BigInt(args.minAmountTokenA),
        minAmountTokenB: BigInt(args.minAmountTokenB),
        deadline: BigInt(args.deadline),
      };
      const calldata = encodeFunction('createLiquidityPosition', params);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding createLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const increaseLiquidityPosition = {
  name: 'increase_sapience_liquidity_position',
  description: 'Increases an existing liquidity position with new parameters',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      positionId: z.string().describe('The ID of the position to increase'),
      collateralAmount: z.string().describe('The amount of collateral to add'),
      gasTokenAmount: z.string().describe('The amount of gas token to add'),
      ethTokenAmount: z.string().describe('The amount of ETH token to add'),
      minGasAmount: z
        .string()
        .describe('The minimum amount of gas token to add'),
      minEthAmount: z
        .string()
        .describe('The minimum amount of ETH token to add'),
      deadline: z
        .string()
        .describe('The deadline for the transaction (timestamp in seconds)'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
    collateralAmount: string;
    gasTokenAmount: string;
    ethTokenAmount: string;
    minGasAmount: string;
    minEthAmount: string;
    deadline: string;
  }): Promise<CallToolResult> => {
    try {
      const params = {
        positionId: BigInt(args.positionId),
        collateralAmount: BigInt(args.collateralAmount),
        gasTokenAmount: BigInt(args.gasTokenAmount),
        ethTokenAmount: BigInt(args.ethTokenAmount),
        minGasAmount: BigInt(args.minGasAmount),
        minEthAmount: BigInt(args.minEthAmount),
        deadline: BigInt(args.deadline),
      };
      const calldata = encodeFunction('increaseLiquidityPosition', params);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding increaseLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const decreaseLiquidityPosition = {
  name: 'decrease_sapience_liquidity_position',
  description: 'Decreases an existing liquidity position',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      positionId: z.string().describe('The ID of the position to decrease'),
      liquidity: z.string().describe('The amount of liquidity to decrease'),
      minGasAmount: z
        .string()
        .describe('The minimum amount of gas token to receive'),
      minEthAmount: z
        .string()
        .describe('The minimum amount of ETH token to receive'),
      deadline: z
        .string()
        .describe('The deadline for the transaction (timestamp in seconds)'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
    liquidity: string;
    minGasAmount: string;
    minEthAmount: string;
    deadline: string;
  }): Promise<CallToolResult> => {
    try {
      const params = {
        positionId: BigInt(args.positionId),
        liquidity: BigInt(args.liquidity),
        minGasAmount: BigInt(args.minGasAmount),
        minEthAmount: BigInt(args.minEthAmount),
        deadline: BigInt(args.deadline),
      };
      const calldata = encodeFunction('decreaseLiquidityPosition', params);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding decreaseLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const settlePosition = {
  name: 'settle_sapience_position',
  description:
    'Settles a position, closing it and returning any remaining collateral, after the market has ended and settled',
  parameters: {
    properties: {
      marketGroupAddress: z
        .string()
        .describe('The address of the market group'),
      positionId: z.string().describe('The ID of the position to settle'),
    },
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
  }): Promise<CallToolResult> => {
    try {
      const calldata = encodeFunction('settlePosition', [
        BigInt(args.positionId),
      ]);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding settlePosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

// export const quoteCreateTraderPosition = {
//   name: 'quote_create_sapience_trader_position',
//   description: 'Gets a quote for creating a new trader position',
//   parameters: {
//     properties: {
//       marketGroupAddress: z
//         .string()
//         .describe('The address of the market group to create the position in'),
//       marketId: z.string().describe('The market ID to create the position in'),
//       collateralAmount: z.string().describe('The amount of collateral to use'),
//       size: z.string().describe('The size of the position'),
//     },
//   },
//   function: async (args: {
//     marketGroupAddress: string;
//     marketId: string;
//     collateralAmount: string;
//     size: string;
//   }): Promise<CallToolResult> => {
//     try {
//       const result = await client.simulateContract({
//         address: args.marketGroupAddress as `0x${string}`,
//         abi: SapienceABI.abi,
//         functionName: 'quoteCreateTraderPosition',
//         args: [BigInt(args.marketId), Number(args.size)],
//       });

//       const [requiredCollateral, fillPrice] = result.result as [bigint, bigint];

//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: JSON.stringify(
//               {
//                 requiredCollateral: requiredCollateral.toString(),
//                 fillPrice: fillPrice.toString(),
//               },
//               null,
//               2
//             ),
//           },
//         ],
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: `Error getting quote for createTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
//           },
//         ],
//         isError: true,
//       };
//     }
//   },
// };

// export const quoteLiquidityPosition = {
//   name: 'quote_create_sapience_liquidity_position',
//   description: 'Gets a quote for creating a new liquidity position',
//   parameters: {
//     properties: {
//       marketGroupAddress: z
//         .string()
//         .describe('The address of the market group to create the position in'),
//       marketId: z.string().describe('The market ID to create the position in'),
//       collateralAmount: z.string().describe('The amount of collateral to use'),
//       size: z.string().describe('The size of the position'),
//     },
//   },
//   function: async (args: {
//     marketGroupAddress: string;
//     marketId: string;
//     collateralAmount: string;
//     size: string;
//   }): Promise<CallToolResult> => {
//     try {
//       const result = await client.simulateContract({
//         address: args.marketGroupAddress as `0x${string}`,
//         abi: SapienceABI.abi,
//         functionName: 'quoteLiquidityPositionTokens',
//         args: [
//           BigInt(args.marketId),
//           BigInt(args.collateralAmount),
//           Number(args.size),
//         ],
//       });

//       const [amount0, amount1, liquidity] = result.result as [
//         bigint,
//         bigint,
//         bigint,
//       ];

//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: JSON.stringify(
//               {
//                 amount0: amount0.toString(),
//                 amount1: amount1.toString(),
//                 liquidity: liquidity.toString(),
//               },
//               null,
//               2
//             ),
//           },
//         ],
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: `Error getting quote for liquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
//           },
//         ],
//         isError: true,
//       };
//     }
//   },
// };

// export const quoteModifyTraderPosition = {
//   name: 'quote_modify_sapience_trader_position',
//   description: 'Gets a quote for modifying an existing trader position',
//   parameters: {
//     properties: {
//       marketGroupAddress: z
//         .string()
//         .describe('The address of the market group'),
//       positionId: z.string().describe('The ID of the position to modify'),
//       newCollateralAmount: z
//         .string()
//         .describe('The new amount of collateral to use'),
//       newSize: z.string().describe('The new size of the position'),
//     },
//   },
//   function: async (args: {
//     marketGroupAddress: string;
//     positionId: string;
//     newCollateralAmount: string;
//     newSize: string;
//   }): Promise<CallToolResult> => {
//     try {
//       const result = await client.simulateContract({
//         address: args.marketGroupAddress as `0x${string}`,
//         abi: SapienceABI.abi,
//         functionName: 'quoteModifyTraderPosition',
//         args: [BigInt(args.positionId), Number(args.newSize)],
//       });

//       const [expectedCollateralDelta, closePnL, fillPrice] = result.result as [
//         bigint,
//         bigint,
//         bigint,
//       ];

//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: JSON.stringify(
//               {
//                 expectedCollateralDelta: expectedCollateralDelta.toString(),
//                 closePnL: closePnL.toString(),
//                 fillPrice: fillPrice.toString(),
//               },
//               null,
//               2
//             ),
//           },
//         ],
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: `Error getting quote for modifyTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
//           },
//         ],
//         isError: true,
//       };
//     }
//   },
// };

// export const quoteModifyLiquidityPosition = {
//   name: 'quote_modify_sapience_liquidity_position',
//   description: 'Gets a quote for modifying an existing liquidity position',
//   parameters: {
//     properties: {
//       marketGroupAddress: z
//         .string()
//         .describe('The address of the market group'),
//       positionId: z.string().describe('The ID of the position to modify'),
//       newCollateralAmount: z
//         .string()
//         .describe('The new amount of collateral to use'),
//       newSize: z.string().describe('The new size of the position'),
//     },
//   },
//   function: async (args: {
//     marketGroupAddress: string;
//     positionId: string;
//     newCollateralAmount: string;
//     newSize: string;
//   }): Promise<CallToolResult> => {
//     try {
//       const result = await client.simulateContract({
//         address: args.marketGroupAddress as `0x${string}`,
//         abi: SapienceABI.abi,
//         functionName: 'quoteRequiredCollateral',
//         args: [BigInt(args.positionId), Number(args.newSize)],
//       });

//       const requiredCollateral = result.result as bigint;

//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: JSON.stringify(
//               {
//                 requiredCollateral: requiredCollateral.toString(),
//               },
//               null,
//               2
//             ),
//           },
//         ],
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: 'text' as const,
//             text: `Error getting quote for modifyLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
//           },
//         ],
//         isError: true,
//       };
//     }
//   },
// };

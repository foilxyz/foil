# Foil MCP Server

## Use with Claude Desktop

After pulling this repo and running `pnpm install`, add the following to your configuration file:
* macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
* Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```
{
    "mcpServers": {
        "sapience": {
            "command": "<PATH_TO_REPO>/sapience/packages/agent/node_modules/.bin/tsx",
            "args": ["<PATH_TO_REPO>/sapience/packages/agent/mcp-server.ts"],
            "cwd": "<PATH_TO_REPO>/sapience/packages/agent"
        }
    }
}
```

## Tools

* `graphql` queries the Foil API for information about each entity in the database:
  * `listResources` - Lists all resources available in the Foil system
  * `listMarkets` - Lists all markets available in the Foil system
  * `getResource` - Gets detailed information about a specific resource by its slug
  * `getMarket` - Gets detailed information about a specific market by its address and chain ID
  * `getEpochs` - Gets information about epochs (periods) in the system, optionally filtered by market ID
  * `getPositions` - Gets information about positions, optionally filtered by chain ID, market address, or owner
  * `getTransactions` - Gets transaction history, optionally filtered by position ID
  * `getMarketCandles` - Gets price candles for a specific market over a time period
  * `getResourceCandles` - Gets price candles for a specific resource over a time period
  * `getResourceTrailingAverageCandles` - Gets trailing average price candles for a specific resource over a time period
  * `getIndexCandles` - Gets index price candles for a specific market over a time period
* `writeFoilContracts` returns the call data to sign for the following functions:
  * `quoteCreateTraderPosition` - Gets a quote for creating a new trader position
  * `createTraderPosition` - Creates a new trader position with specified parameters
  * `quoteModifyTraderPosition` - Gets a quote for modifying an existing trader position
  * `modifyTraderPosition` - Modifies an existing trader position with new parameters
  * `quoteLiquidityPosition` - Gets a quote for creating a new liquidity position
  * `createLiquidityPosition` - Creates a new liquidity position with specified parameters
  * `quoteModifyLiquidityPosition` - Gets a quote for modifying an existing liquidity position
  * `modifyLiquidityPosition` - Modifies an existing liquidity position with new parameters
  * `settlePosition` - Settles a position, closing it and returning any remaining collateral, after the market/period has ended and settled
* `readFoilContracts` returns information from a given Foil contract via the following functions:
  * `getReferencePrice` - Gets the reference price for a market
  * `getMarketInfo` - Gets detailed information about a market's configuration
  * `getEpochInfo` - Gets detailed information about a specific period
  * `getLatestEpochInfo` - Gets information about the most recent period
  * `getTokenOwner` - Gets the owner address of a specific position token
  * `getTokenByIndex` - Gets a position token ID by its index
  * `getPosition` - Gets detailed position data including kind, period, collateral amounts, borrowed amounts, etc.
  * `getPositionCollateralValue` - Gets the collateral value of a position
  * `getPositionPnl` - Gets the PnL of a position
  * `getPositionSize` - Gets the size of a position
  * `getSqrtPriceX96` - Gets the square root price for an period
  * `getDecimalPriceFromSqrtPriceX96` - Converts sqrt price to decimal price
  * `getMarketTickSpacing` - Gets the tick spacing for the market
  * `totalSupply` - Gets total number of positions
  * `balanceOf` - Gets number of positions owned by an address
* `misc` handles different 
  * `stage_transaction` - Stages a transaction to the safe service
  * `execute_transaction` - Executes a transaction using viem and the private key from env.ETHEREUM_PRIVATE_KEY
  * `approve_token` - Returns the calldata for an ERC-20 approval
  * `balance_of_token` - Reads the ERC-20 token balance of an owner

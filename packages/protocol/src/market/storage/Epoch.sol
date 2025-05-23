// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "../libraries/DecimalMath.sol";

import "../external/VirtualToken.sol";
import "../libraries/DecimalPrice.sol";
import "../libraries/Quote.sol";
import "../external/univ3/LiquidityAmounts.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
import "./Debt.sol";
import "./Errors.sol";
import "./Market.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

library Epoch {
    using DecimalMath for uint256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    struct Settlement {
        uint160 settlementPriceSqrtX96;
        uint256 submissionTime;
        bool disputed;
    }

    struct Data {
        uint256 startTime;
        uint256 endTime;
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        VirtualToken ethToken;
        VirtualToken gasToken;
        IUniswapV3Pool pool;
        bool settled;
        uint256 settlementPriceD18;
        mapping(uint256 => Debt.Data) lpDebtPositions;
        bytes32 assertionId;
        Settlement settlement;
        IFoilStructs.MarketParams marketParams; // Storing marketParams as a struct within Epoch.Data
        uint160 sqrtPriceMinX96;
        uint160 sqrtPriceMaxX96;
        uint256 minPriceD18;
        uint256 maxPriceD18;
        uint256 feeRateD18;
        uint256 id;
        bytes claimStatement;
    }

    function load(uint256 id) internal pure returns (Data storage epoch) {
        bytes32 s = keccak256(abi.encode("foil.gas.epoch", id));

        assembly {
            epoch.slot := s
        }
    }

    function createValid(
        uint256 id,
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        int24 baseAssetMinPriceTick,
        int24 baseAssetMaxPriceTick,
        uint256 salt,
        bytes calldata claimStatement
    ) internal returns (Data storage epoch) {
        Market.Data storage market = Market.loadValid();
        IFoilStructs.MarketParams storage marketParams = market.marketParams;

        epoch = load(id);

        require(
            claimStatement.length > 0,
            "claimStatement must be non-empty"
        );

        // can only be called once
        if (epoch.startTime != 0) {
            revert Errors.EpochAlreadyStarted();
        }

        if (startTime == 0) {
            revert Errors.StartTimeCannotBeZero();
        }

        if (endTime <= startTime) {
            revert Errors.EndTimeTooEarly(startTime, endTime);
        }

        if (
            address(epoch.ethToken) != address(0) ||
            address(epoch.gasToken) != address(0)
        ) {
            revert Errors.TokensAlreadyCreated();
        }

        // set id on first creation
        if (epoch.id == 0) epoch.id = id;

        epoch.startTime = startTime;
        epoch.endTime = endTime;

        // claim statement is the statement that will be used to assert the truth of the epoch
        epoch.claimStatement = claimStatement;

        // copy over market parameters into epoch (clone them to prevent any changes to market marketParams)
        epoch.marketParams.feeRate = marketParams.feeRate;
        epoch.marketParams.assertionLiveness = marketParams.assertionLiveness;
        epoch.marketParams.bondCurrency = marketParams.bondCurrency;
        epoch.marketParams.bondAmount = marketParams.bondAmount;
        epoch.marketParams.uniswapPositionManager = marketParams
            .uniswapPositionManager;
        epoch.marketParams.uniswapSwapRouter = marketParams.uniswapSwapRouter;
        epoch.marketParams.uniswapQuoter = marketParams.uniswapQuoter;
        epoch.marketParams.optimisticOracleV3 = marketParams.optimisticOracleV3;

        validateEpochBounds(
            epoch,
            baseAssetMinPriceTick,
            baseAssetMaxPriceTick
        );
        epoch.baseAssetMinPriceTick = baseAssetMinPriceTick;
        epoch.baseAssetMaxPriceTick = baseAssetMaxPriceTick;
        epoch.feeRateD18 = uint256(marketParams.feeRate) * 1e12;

        // check market.marketParams.bondAmount is greater than the minimum bond for the assertion currency
        uint256 minUMABond = OptimisticOracleV3Interface(
            marketParams.optimisticOracleV3
        ).getMinimumBond(marketParams.bondCurrency);
        if (marketParams.bondAmount < minUMABond) {
            // Cap the bond amount at the minimum bond for the assertion currency
            epoch.marketParams.bondAmount = minUMABond;
        }
        VirtualToken tokenA = _createVirtualToken(salt, "Token A", "tknA");
        VirtualToken tokenB = _createVirtualToken(salt + 1, "Token B", "tknB");

        if (address(tokenA) < address(tokenB)) {
            epoch.gasToken = tokenA;
            epoch.ethToken = tokenB;
        } else {
            epoch.gasToken = tokenB;
            epoch.ethToken = tokenA;
        }

        // create & initialize pool
        epoch.pool = IUniswapV3Pool(
            IUniswapV3Factory(
                INonfungiblePositionManager(
                    market.marketParams.uniswapPositionManager
                ).factory()
            ).createPool(
                    address(epoch.gasToken),
                    address(epoch.ethToken),
                    marketParams.feeRate
                )
        );
        epoch.pool.initialize(startingSqrtPriceX96); // starting price

        int24 spacing = epoch.pool.tickSpacing();
        // store min/max prices
        epoch.sqrtPriceMinX96 = TickMath.getSqrtRatioAtTick(
            epoch.baseAssetMinPriceTick
        );
        // use next tick for max price
        epoch.sqrtPriceMaxX96 = TickMath.getSqrtRatioAtTick(
            epoch.baseAssetMaxPriceTick + spacing
        );
        epoch.maxPriceD18 = DecimalPrice.sqrtRatioX96ToPrice(
            epoch.sqrtPriceMaxX96
        );
        epoch.minPriceD18 = DecimalPrice.sqrtRatioX96ToPrice(
            epoch.sqrtPriceMinX96
        );

        // Validate starting price is within the range
        if (
            startingSqrtPriceX96 < epoch.sqrtPriceMinX96 ||
            startingSqrtPriceX96 > epoch.sqrtPriceMaxX96
        ) {
            revert Errors.InvalidStartingPrice(
                startingSqrtPriceX96,
                epoch.sqrtPriceMinX96,
                epoch.sqrtPriceMaxX96
            );
        }

        // mint max; track tokens loaned by in FAccount
        epoch.ethToken.mint(address(this), type(uint256).max);
        epoch.gasToken.mint(address(this), type(uint256).max);

        // approve to uniswapPositionManager
        epoch.ethToken.approve(
            address(market.marketParams.uniswapPositionManager),
            type(uint256).max
        );
        epoch.gasToken.approve(
            address(market.marketParams.uniswapPositionManager),
            type(uint256).max
        );

        // approve to uniswapSwapRouter
        epoch.ethToken.approve(
            address(market.marketParams.uniswapSwapRouter),
            type(uint256).max
        );
        epoch.gasToken.approve(
            address(market.marketParams.uniswapSwapRouter),
            type(uint256).max
        );
    }

    function _createVirtualToken(
        uint256 initialSalt,
        string memory name,
        string memory symbol
    ) private returns (VirtualToken token) {
        uint256 currentSalt = initialSalt;
        uint256 currentBlockNumber = block.number;
        while (true) {
            bytes32 salt = keccak256(
                abi.encodePacked(
                    currentSalt,
                    currentBlockNumber,
                    block.coinbase
                )
            );
            try
                new VirtualToken{salt: bytes32(salt)}(
                    address(this),
                    name,
                    symbol
                )
            returns (VirtualToken _token) {
                return _token;
            } catch {
                currentSalt++;
                currentBlockNumber++;
            }
        }
    }

    function loadValid(uint256 id) internal view returns (Data storage epoch) {
        epoch = load(id);

        if (epoch.endTime == 0) {
            revert Errors.InvalidEpoch();
        }
    }

    function validateLpRequirements(
        Data storage self,
        int24 lowerTick,
        int24 upperTick
    ) internal view {
        validateEpochNotExpired(self);

        int24 minTick = self.baseAssetMinPriceTick;
        int24 maxTick = self.baseAssetMaxPriceTick;
        if (lowerTick < minTick) revert Errors.InvalidRange(lowerTick, minTick);
        if (upperTick > maxTick) revert Errors.InvalidRange(upperTick, maxTick);
    }

    function validateEpochNotExpired(Data storage self) internal view {
        if (self.settled || block.timestamp >= self.endTime) {
            revert Errors.ExpiredEpoch();
        }
    }

    function validateNotSettled(Data storage self) internal view {
        if (block.timestamp >= self.endTime && !self.settled) {
            revert Errors.ExpiredEpochNotSettled(self.endTime);
        }

        if (self.settled) {
            revert Errors.EpochSettled();
        }
    }

    function validateEpochBounds(
        Data storage self,
        int24 minPriceTick,
        int24 maxPriceTick
    ) internal view {
        int24 tickSpacing = getTickSpacingForFee(self.marketParams.feeRate);
        if (minPriceTick % tickSpacing != 0) {
            revert Errors.InvalidBaseAssetMinPriceTick(
                minPriceTick,
                tickSpacing
            );
        }

        if (maxPriceTick % tickSpacing != 0) {
            revert Errors.InvalidBaseAssetMaxPriceTick(
                maxPriceTick,
                tickSpacing
            );
        }

        if (minPriceTick >= maxPriceTick) {
            revert Errors.InvalidPriceTickRange(minPriceTick, maxPriceTick);
        }
    }

    /**
     * @notice Gets the required collateral amount to cover the loan amounts
     *
     * @param self Epoch storage
     * @param ownedGasAmount Amount of gas owned by the trader
     * @param ownedEthAmount Amount of eth owned by the trader
     * @param loanGasAmount Amount of gas loaned by the trader
     * @param loanEthAmount Amount of eth loaned by the trader
     */
    function getCollateralRequirementsForTrade(
        Data storage self,
        uint256 ownedGasAmount,
        uint256 ownedEthAmount,
        uint256 loanGasAmount,
        uint256 loanEthAmount
    ) internal view returns (uint256 requiredCollateral) {
        uint256 requiredCollateralAtMinPrice = getCollateralRequiredAtPrice(
            self,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            self.minPriceD18
        );

        uint256 requiredCollateralAtMaxPrice = getCollateralRequiredAtPrice(
            self,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            self.maxPriceD18
        );

        requiredCollateral = requiredCollateralAtMinPrice >
            requiredCollateralAtMaxPrice
            ? requiredCollateralAtMinPrice
            : requiredCollateralAtMaxPrice;
    }

    /**
     * @notice Validates that the provided collateral amount is sufficient to cover the loan amounts
     * @notice will revert if not enough collateral is provided
     *
     * @param self Epoch storage
     * @param collateralAmount Amount of collateral provided
     * @param ownedGasAmount Amount of gas owned by the trader
     * @param ownedEthAmount Amount of eth owned by the trader
     * @param loanGasAmount Amount of gas loaned by the trader
     * @param loanEthAmount Amount of eth loaned by the trader
     */
    function validateCollateralRequirementsForTrade(
        Data storage self,
        uint256 collateralAmount,
        uint256 ownedGasAmount,
        uint256 ownedEthAmount,
        uint256 loanGasAmount,
        uint256 loanEthAmount
    ) internal view {
        validateOwnedAndDebtAtPrice(
            self,
            collateralAmount,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            self.minPriceD18
        );

        validateOwnedAndDebtAtPrice(
            self,
            collateralAmount,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            self.maxPriceD18
        );
    }

    function getCollateralRequiredAtPrice(
        Data storage self,
        uint256 ownedGasAmount,
        uint256 ownedEthAmount,
        uint256 loanGasAmount,
        uint256 loanEthAmount,
        uint256 price
    ) internal view returns (uint256 requiredCollateral) {
        uint256 gasAmount;
        uint256 ethAmount;
        uint256 gasDebt;
        uint256 ethDebt;

        // Consolidate to only trade what is needed
        if (ownedGasAmount > loanGasAmount) {
            gasAmount = ownedGasAmount - loanGasAmount;
            gasDebt = 0;
        } else {
            gasAmount = 0;
            gasDebt = loanGasAmount - ownedGasAmount;
        }

        if (ownedEthAmount > loanEthAmount) {
            ethAmount = ownedEthAmount - loanEthAmount;
            ethDebt = 0;
        } else {
            ethAmount = 0;
            ethDebt = loanEthAmount - ownedEthAmount;
        }

        // Get total debt
        uint256 adjustedPrice = self.settled
            ? price
            : price.mulDecimal((DecimalMath.UNIT + self.feeRateD18));
        uint256 totalDebtValue = Quote.quoteGasToEthWithPrice(
            gasDebt,
            adjustedPrice
        ) + ethDebt;

        // Get total credit
        adjustedPrice = self.settled
            ? price
            : price.mulDecimal((DecimalMath.UNIT - self.feeRateD18));
        uint256 totalOwnedValue = Quote.quoteGasToEthWithPrice(
            gasAmount,
            adjustedPrice
        ) + ethAmount;

        requiredCollateral = totalDebtValue > totalOwnedValue
            ? totalDebtValue - totalOwnedValue
            : 0;

        // Adding 2 wei to prevent round up errors if greater than 0. Insignificant amount for normal operations but to prevent potential issues
        if (requiredCollateral > 0) requiredCollateral += 2;
    }

    function validateOwnedAndDebtAtPrice(
        Data storage self,
        uint256 collateralAmount,
        uint256 ownedGasAmount,
        uint256 ownedEthAmount,
        uint256 loanGasAmount,
        uint256 loanEthAmount,
        uint256 price
    ) internal view {
        uint256 requiredCollateral = getCollateralRequiredAtPrice(
            self,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            price
        );

        if (requiredCollateral > collateralAmount) {
            revert Errors.InsufficientCollateral(
                requiredCollateral,
                collateralAmount
            );
        }
    }

    function getCurrentPoolPriceSqrtX96(
        Data storage self
    ) internal view returns (uint160 sqrtPriceX96) {
        (sqrtPriceX96, , , , , , ) = self.pool.slot0();
    }

    function getCurrentPoolPrice(
        Data storage self
    ) internal view returns (uint256 decimalPrice) {
        uint160 sqrtPriceX96 = getCurrentPoolPriceSqrtX96(self);

        return DecimalPrice.sqrtRatioX96ToPrice(sqrtPriceX96);
    }

    function validateCurrentPoolPriceInRange(Data storage self) internal view {
        (uint160 sqrtPriceX96, , , , , , ) = self.pool.slot0();

        validatePriceInRange(self, sqrtPriceX96);
    }

    function validatePriceInRange(
        Data storage self,
        uint160 priceX96
    ) internal view {
        if (
            priceX96 < self.sqrtPriceMinX96 || priceX96 > self.sqrtPriceMaxX96
        ) {
            revert Errors.PoolPriceOutOfRange(
                priceX96,
                self.sqrtPriceMinX96,
                self.sqrtPriceMaxX96
            );
        }
    }

    function requiredCollateralForLiquidity(
        Data storage self,
        uint128 liquidity,
        uint256 loanAmount0,
        uint256 loanAmount1,
        uint256 tokensOwed0,
        uint256 tokensOwed1,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    ) internal view returns (uint256 requiredCollateral) {
        // Note: +1 to prevent rounding errors when calculating collateral requirements inside collateralRequirementAtMinTick and collateralRequirementAtMaxTick
        uint256 collateralRequirementAtMin = collateralRequirementAtMinTick(
            self,
            liquidity,
            sqrtPriceAX96,
            sqrtPriceBX96,
            loanAmount0 + 1,
            loanAmount1 + 1,
            tokensOwed0,
            tokensOwed1
        );
        uint256 collateralRequirementAtMax = collateralRequirementAtMaxTick(
            self,
            liquidity,
            sqrtPriceAX96,
            sqrtPriceBX96,
            loanAmount0 + 1,
            loanAmount1 + 1,
            tokensOwed0,
            tokensOwed1
        );
        requiredCollateral = collateralRequirementAtMin >
            collateralRequirementAtMax
            ? collateralRequirementAtMin
            : collateralRequirementAtMax;

        // Adding 2 wei to prevent round up errors. Insignificant amount for normal operations but to prevent potential issues
        if (requiredCollateral > 0) {
            requiredCollateral += 2;
        }
    }

    function collateralRequirementAtMinTick(
        Data storage self,
        uint128 liquidity,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96,
        uint256 loanAmount0,
        uint256 loanAmount1,
        uint256 tokensOwed0,
        uint256 tokensOwed1
    ) internal view returns (uint256) {
        uint256 maxAmount0 = LiquidityAmounts.getAmount0ForLiquidity(
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidity
        );

        uint256 liquidityAmount0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
            maxAmount0,
            self.minPriceD18
        );

        uint256 creditEth = liquidityAmount0ConvertedTo1 + tokensOwed1;
        uint256 debitEth = loanAmount1;

        // Adjust debit or credit with new loan amount balance
        if (loanAmount0 > tokensOwed0) {
            uint256 net0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
                loanAmount0 - tokensOwed0,
                self.minPriceD18
            );

            debitEth += net0ConvertedTo1;
        } else {
            uint256 net0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
                tokensOwed0 - loanAmount0,
                self.minPriceD18
            );

            creditEth += net0ConvertedTo1;
        }

        return debitEth > creditEth ? debitEth - creditEth : 0;
    }

    function collateralRequirementAtMaxTick(
        Data storage self,
        uint128 liquidity,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96,
        uint256 loanAmount0,
        uint256 loanAmount1,
        uint256 tokensOwed0,
        uint256 tokensOwed1
    ) internal view returns (uint256) {
        uint256 maxAmount1 = LiquidityAmounts.getAmount1ForLiquidity(
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidity
        );

        uint256 creditEth = maxAmount1 + tokensOwed1;
        uint256 debitEth = loanAmount1;

        // Adjust debit or credit with new loan amount balance
        if (loanAmount0 > tokensOwed0) {
            uint256 net0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
                loanAmount0 - tokensOwed0,
                self.maxPriceD18
            );

            debitEth += net0ConvertedTo1;
        } else {
            uint256 net0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
                tokensOwed0 - loanAmount0,
                self.minPriceD18 // Use min price to avoid profit masking an insolvent position at an intermediate tick
            );

            creditEth += net0ConvertedTo1;
        }

        return debitEth > creditEth ? debitEth - creditEth : 0;
    }

    function setSettlementPriceInRange(
        Data storage self,
        uint256 settlementPriceD18
    ) internal returns (uint256) {
        if (settlementPriceD18 > self.maxPriceD18) {
            self.settlementPriceD18 = self.maxPriceD18;
        } else if (settlementPriceD18 < self.minPriceD18) {
            self.settlementPriceD18 = self.minPriceD18;
        } else {
            self.settlementPriceD18 = settlementPriceD18;
        }

        self.settled = true;

        return self.settlementPriceD18;
    }

    function getTickSpacingForFee(uint24 fee) internal pure returns (int24) {
        if (fee == 100) {
            return 1;
        } else if (fee == 500) {
            return 10;
        } else if (fee == 3000) {
            return 60;
        } else if (fee == 10000) {
            return 200;
        } else {
            return 0;
        }
    }

    function getReferencePrice(
        Data storage self
    ) internal view returns (uint256) {
        return
            self.settled ? self.settlementPriceD18 : getCurrentPoolPrice(self);
    }
}

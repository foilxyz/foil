// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/ERC721EnumerableStorage.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../storage/Position.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {ILiquidityModule} from "../interfaces/ILiquidityModule.sol";
import {Pool} from "../libraries/Pool.sol";

import "forge-std/console2.sol";

contract LiquidityModule is ReentrancyGuardUpgradeable, ILiquidityModule {
    using Position for Position.Data;
    using Epoch for Epoch.Data;
    using Market for Market.Data;

    function createLiquidityPosition(
        IFoilStructs.LiquidityMintParams calldata params
    )
        external
        override
        nonReentrant
        returns (
            uint256 id,
            uint256 collateralAmount,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        )
    {
        console2.log("AAA 1");
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }
        console2.log("AAA 2");

        id = ERC721EnumerableStorage.totalSupply() + 1;
        Position.Data storage position = Position.createValid(id);
        ERC721Storage._checkOnERC721Received(address(this), msg.sender, id, "");
        ERC721Storage._mint(msg.sender, id);
        console2.log("AAA 3");

        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.loadValid(params.epochId);
        epoch.validateLpRequirements(params.lowerTick, params.upperTick);
        console2.log("AAA 4");

        console2.log("params.amountTokenA", params.amountTokenA);
        console2.log("params.amountTokenB", params.amountTokenB);
        console2.log("params.minAmountTokenA", params.minAmountTokenA);
        console2.log("params.minAmountTokenB", params.minAmountTokenB);
        console2.log("params.deadline", params.deadline);
        console2.log("params.lowerTick", params.lowerTick);
        console2.log("params.upperTick", params.upperTick);

        (
            uniswapNftId,
            liquidity,
            addedAmount0,
            addedAmount1
        ) = INonfungiblePositionManager(epoch.params.uniswapPositionManager)
            .mint(
                INonfungiblePositionManager.MintParams({
                    token0: address(epoch.gasToken),
                    token1: address(epoch.ethToken),
                    fee: epoch.params.feeRate,
                    tickLower: params.lowerTick,
                    tickUpper: params.upperTick,
                    amount0Desired: params.amountTokenA,
                    amount1Desired: params.amountTokenB,
                    amount0Min: params.minAmountTokenA,
                    amount1Min: params.minAmountTokenB,
                    recipient: address(this),
                    deadline: params.deadline
                })
            );
        console2.log("AAA 5");

        (collateralAmount, , ) = position.updateValidLp(
            market,
            epoch,
            Position.UpdateLpParams({
                uniswapNftId: uniswapNftId,
                liquidity: liquidity,
                additionalCollateral: params.collateralAmount,
                additionalLoanAmount0: addedAmount0,
                additionalLoanAmount1: addedAmount1,
                lowerTick: params.lowerTick,
                upperTick: params.upperTick,
                tokensOwed0: 0,
                tokensOwed1: 0
            })
        );
        console2.log("AAA 6");

        _emitLiquidityPositionCreated(
            ILiquidityModule.LiquidityPositionCreatedEventData({
                sender: msg.sender,
                epochId: epoch.id,
                positionId: id,
                depositedCollateralAmount: position.depositedCollateralAmount,
                liquidity: liquidity,
                addedAmount0: addedAmount0,
                addedAmount1: addedAmount1,
                lowerTick: params.lowerTick,
                upperTick: params.upperTick
            })
        );
        console2.log("AAA 7");
    }

    function decreaseLiquidityPosition(
        IFoilStructs.LiquidityDecreaseParams memory params
    )
        external
        override
        nonReentrant
        returns (
            uint256 decreasedAmount0,
            uint256 decreasedAmount1,
            uint256 collateralAmount
        )
    {
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }

        DecreaseLiquidityPositionStack memory stack;

        Market.Data storage market = Market.load();
        Position.Data storage position = Position.loadValid(params.positionId);
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);

        epoch.validateEpochNotExpired();
        position.preValidateLp();
        (
            stack.previousAmount0,
            stack.previousAmount1,
            stack.lowerTick,
            stack.upperTick,
            stack.previousLiquidity
        ) = Pool.getCurrentPositionTokenAmounts(market, epoch, position);

        stack.decreaseParams = INonfungiblePositionManager
            .DecreaseLiquidityParams({
                tokenId: position.uniswapPositionId,
                liquidity: params.liquidity,
                amount0Min: params.minGasAmount,
                amount1Min: params.minEthAmount,
                deadline: params.deadline
            });

        (decreasedAmount0, decreasedAmount1) = INonfungiblePositionManager(
            epoch.params.uniswapPositionManager
        ).decreaseLiquidity(stack.decreaseParams);

        // if all liquidity is removed, close the position and return
        if (params.liquidity == stack.previousLiquidity)
            return _closeLiquidityPosition(market, position);

        // otherwise, validate the decreased liquidity and update the position
        // get tokens owed
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            stack.tokensOwed0,
            stack.tokensOwed1
        ) = INonfungiblePositionManager(epoch.params.uniswapPositionManager)
            .positions(position.uniswapPositionId);

        uint256 loanAmount0;
        uint256 loanAmount1;

        (collateralAmount, loanAmount0, loanAmount1) = position.updateValidLp(
            market,
            epoch,
            Position.UpdateLpParams({
                uniswapNftId: position.uniswapPositionId,
                liquidity: stack.previousLiquidity - params.liquidity,
                additionalCollateral: 0,
                additionalLoanAmount0: 0,
                additionalLoanAmount1: 0,
                lowerTick: stack.lowerTick,
                upperTick: stack.upperTick,
                tokensOwed0: stack.tokensOwed0, // decreased token0 + any fees accrued
                tokensOwed1: stack.tokensOwed1 // decreased token1 + any fees accrued
            })
        );

        emit LiquidityPositionDecreased(
            msg.sender,
            epoch.id,
            position.id,
            position.depositedCollateralAmount,
            params.liquidity,
            decreasedAmount0,
            decreasedAmount1,
            loanAmount0,
            loanAmount1
        );
    }

    function increaseLiquidityPosition(
        IFoilStructs.LiquidityIncreaseParams memory params
    )
        external
        nonReentrant
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1,
            uint256 collateralAmount
        )
    {
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }

        IncreaseLiquidityPositionStack memory stack;

        Market.Data storage market = Market.load();
        Position.Data storage position = Position.loadValid(params.positionId);
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);

        epoch.validateEpochNotExpired();
        position.preValidateLp();

        (
            stack.previousAmount0,
            stack.previousAmount1,
            stack.lowerTick,
            stack.upperTick,
            stack.previousLiquidity
        ) = Pool.getCurrentPositionTokenAmounts(market, epoch, position);

        stack.increaseParams = INonfungiblePositionManager
            .IncreaseLiquidityParams({
                tokenId: position.uniswapPositionId,
                amount0Desired: params.gasTokenAmount,
                amount1Desired: params.ethTokenAmount,
                amount0Min: params.minGasAmount,
                amount1Min: params.minEthAmount,
                deadline: params.deadline
            });

        (liquidity, amount0, amount1) = INonfungiblePositionManager(
            epoch.params.uniswapPositionManager
        ).increaseLiquidity(stack.increaseParams);

        // get tokens owed
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            stack.tokensOwed0,
            stack.tokensOwed1
        ) = INonfungiblePositionManager(epoch.params.uniswapPositionManager)
            .positions(position.uniswapPositionId);

        uint256 loanAmount0;
        uint256 loanAmount1;

        (collateralAmount, loanAmount0, loanAmount1) = position.updateValidLp(
            market,
            epoch,
            Position.UpdateLpParams({
                uniswapNftId: position.uniswapPositionId,
                liquidity: stack.previousLiquidity + liquidity,
                additionalCollateral: params.collateralAmount,
                additionalLoanAmount0: amount0, // these are the added tokens to the position
                additionalLoanAmount1: amount1,
                lowerTick: stack.lowerTick,
                upperTick: stack.upperTick,
                tokensOwed0: stack.tokensOwed0,
                tokensOwed1: stack.tokensOwed1
            })
        );

        emit LiquidityPositionIncreased(
            msg.sender,
            epoch.id,
            position.id,
            position.depositedCollateralAmount,
            liquidity,
            amount0,
            amount1,
            loanAmount0,
            loanAmount1
        );
    }

    function quoteLiquidityPositionTokens(
        uint256 epochId,
        uint256 depositedCollateralAmount,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    )
        external
        view
        override
        returns (uint256 amount0, uint256 amount1, uint128 liquidity)
    {
        Epoch.Data storage epoch = Epoch.load(epochId);

        // calculate for unit
        uint128 unitLiquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            1e18,
            1e18
        );

        (uint256 unitAmount0, uint256 unitAmount1) = LiquidityAmounts
            .getAmountsForLiquidity(
                sqrtPriceX96,
                sqrtPriceAX96,
                sqrtPriceBX96,
                unitLiquidity
            );

        uint256 requiredCollateral = epoch.requiredCollateralForLiquidity(
            unitLiquidity,
            unitAmount0,
            unitAmount1,
            0,
            0,
            sqrtPriceAX96,
            sqrtPriceBX96
        );

        // scale up for fractional collateral ratio
        uint256 collateralRatio = FullMath.mulDiv(
            depositedCollateralAmount,
            1e18, // Create MathUtil and use UNIT
            requiredCollateral
        );

        // scale up liquidity by collateral amount
        return (
            FullMath.mulDiv(unitAmount0, collateralRatio, 1e18),
            FullMath.mulDiv(unitAmount1, collateralRatio, 1e18),
            uint128(unitLiquidity * collateralRatio) / 1e18
        );
    }

    function depositCollateral(
        uint256 positionId,
        uint256 collateralAmount
    ) external override {
        if (!Market.load().isFeeCollector(msg.sender)) {
            revert Errors.OnlyFeeCollector();
        }

        Position.Data storage position = Position.loadValid(positionId);
        position.validateLp();
        // add to the collateral instead of updating
        position.updateCollateral(
            position.depositedCollateralAmount + collateralAmount
        );

        emit CollateralDeposited(
            msg.sender,
            position.epochId,
            position.id,
            position.depositedCollateralAmount
        );
    }

    function _closeLiquidityPosition(
        Market.Data storage market,
        Position.Data storage position
    )
        internal
        returns (
            uint256 collectedAmount0,
            uint256 collectedAmount1,
            uint256 collateralAmount
        )
    {
        Epoch.Data storage epoch = Epoch.loadValid(position.epochId);
        // Collect fees and remaining tokens
        (collectedAmount0, collectedAmount1) = INonfungiblePositionManager(
            epoch.params.uniswapPositionManager
        ).collect(
                INonfungiblePositionManager.CollectParams({
                    tokenId: position.uniswapPositionId,
                    recipient: address(this),
                    amount0Max: type(uint128).max,
                    amount1Max: type(uint128).max
                })
            );
        // Burn the Uniswap position
        INonfungiblePositionManager(epoch.params.uniswapPositionManager).burn(
            position.uniswapPositionId
        );
        position.uniswapPositionId = 0;

        // due to rounding on the uniswap side, 1 wei is left over on loan amount when opening & immediately closing position
        // it seems like it's always 1 wei lower than original added amount so adding it to collected amount to make sure we don't have any rounding error
        collectedAmount0 += 1;
        collectedAmount1 += 1;

        if (collectedAmount0 > position.borrowedVGas) {
            position.vGasAmount = collectedAmount0 - position.borrowedVGas;
            position.borrowedVGas = 0;
        } else {
            position.borrowedVGas = position.borrowedVGas - collectedAmount0;
        }

        // recouncil with deposited collateral
        if (collectedAmount1 > position.borrowedVEth) {
            position.depositedCollateralAmount +=
                collectedAmount1 -
                position.borrowedVEth;
            position.borrowedVEth = 0;
        } else {
            uint256 collateralDelta = position.borrowedVEth - collectedAmount1;
            if (position.depositedCollateralAmount < collateralDelta) {
                position.borrowedVEth = collateralDelta;
            } else {
                position.depositedCollateralAmount -= collateralDelta;
                position.borrowedVEth = 0;
            }
        }

        // if all debt is paid off, and no vGAS, withdraw collateral to user
        // otherwise, transition user to trader and user can trade through pool to close position
        // in a subsequent tx
        if (
            position.borrowedVGas == 0 &&
            position.vGasAmount == 0 &&
            position.borrowedVEth == 0
        ) {
            market.withdrawCollateral(
                ERC721Storage._ownerOf(position.id),
                position.depositedCollateralAmount
            );
            position.depositedCollateralAmount = 0;
            position.kind = IFoilStructs.PositionKind.Unknown;
        } else {
            position.kind = IFoilStructs.PositionKind.Trade;
        }

        collateralAmount = position.depositedCollateralAmount;

        // Emit an event for the closed position
        emit LiquidityPositionClosed(
            msg.sender,
            epoch.id,
            position.id,
            position.kind,
            collectedAmount0,
            collectedAmount1,
            position.borrowedVGas,
            position.borrowedVEth
        );
    }

    function _emitLiquidityPositionCreated(
        ILiquidityModule.LiquidityPositionCreatedEventData memory eventData
    ) private {
        emit LiquidityPositionCreated(
            eventData.sender,
            eventData.epochId,
            eventData.positionId,
            eventData.depositedCollateralAmount,
            eventData.liquidity,
            eventData.addedAmount0,
            eventData.addedAmount1,
            eventData.lowerTick,
            eventData.upperTick
        );
    }
}

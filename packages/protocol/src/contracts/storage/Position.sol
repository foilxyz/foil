// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";
import {SafeCastU256} from "../../synthetix/utils/SafeCast.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {PositionKey} from "../libraries/PositionKey.sol";
import {ERC721Storage} from "./ERC721Storage.sol";
import {Errors} from "./Errors.sol";

library Position {
    using SafeCastU256 for uint256;
    using Epoch for Epoch.Data;

    struct Data {
        uint256 id;
        IFoilStructs.PositionKind kind;
        uint256 epochId;
        // Accounting data (debt and deposited collateral)
        uint256 depositedCollateralAmount; // configured collateral
        uint256 borrowedVEth;
        uint256 borrowedVGas;
        // Position data (owned tokens and position size)
        uint256 vEthAmount;
        uint256 vGasAmount;
        int256 currentTokenAmount;
        uint256 uniswapPositionId; // uniswap nft id
        bool isSettled;
    }

    function load(
        uint256 positionId
    ) internal pure returns (Data storage position) {
        bytes32 s = keccak256(abi.encode("foil.gas.position", positionId));

        assembly {
            position.slot := s
        }
    }

    function loadValid(
        uint256 positionId
    ) internal view returns (Data storage position) {
        position = load(positionId);
        if (positionId == 0 || position.id == 0) {
            revert Errors.InvalidPositionId(positionId);
        }
    }

    function createValid(
        uint256 positionId
    ) internal returns (Data storage position) {
        if (positionId == 0) {
            revert Errors.InvalidPositionId(positionId);
        }

        position = load(positionId);

        if (position.id != 0) {
            revert Errors.PositionAlreadyCreated();
        }

        position.id = positionId;
        return position;
    }

    function updateBalance(
        Data storage self,
        int256 deltaTokenAmount,
        int256 vEthDeltaAmount,
        int256 vGasDeltaAmount
    ) internal {
        self.currentTokenAmount += deltaTokenAmount;
        self.vEthAmount = uint256(self.vEthAmount.toInt() + vEthDeltaAmount);
        self.vGasAmount = uint256(self.vGasAmount.toInt() + vGasDeltaAmount);
    }

    function resetBalance(Data storage self) internal {
        self.currentTokenAmount = 0;
        self.vEthAmount = 0;
        self.vGasAmount = 0;
    }

    function updateCollateral(Data storage self, uint256 amount) internal {
        IERC20 collateralAsset = Market.load().collateralAsset;
        if (amount > self.depositedCollateralAmount) {
            collateralAsset.transferFrom(
                msg.sender,
                address(this),
                amount - self.depositedCollateralAmount
            );
        } else {
            collateralAsset.transfer(
                msg.sender,
                self.depositedCollateralAmount - amount
            );
        }

        self.depositedCollateralAmount = amount;
    }

    function afterTradeCheck(Data storage self) internal view {
        Epoch.load(self.epochId).validateCollateralRequirementsForTrade(
            self.depositedCollateralAmount,
            self.vGasAmount,
            self.vEthAmount,
            self.borrowedVGas,
            self.borrowedVEth
        );
    }

    function preValidateLp(Data storage self) internal view {
        if (self.kind != IFoilStructs.PositionKind.Liquidity) {
            revert Errors.InvalidPositionKind();
        }

        if (self.isSettled) {
            revert Errors.PositionAlreadySettled(self.id);
        }

        if (ERC721Storage._ownerOf(self.id) != msg.sender) {
            revert Errors.NotAccountOwnerOrAuthorized(self.id, msg.sender);
        }
    }

    struct UpdateLpParams {
        uint256 uniswapNftId;
        uint128 liquidity;
        uint256 additionalCollateral;
        uint256 additionalLoanAmount0;
        uint256 additionalLoanAmount1;
        int24 lowerTick;
        int24 upperTick;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
    }

    function updateValidLp(
        Data storage self,
        Epoch.Data storage epoch,
        UpdateLpParams memory params
    ) internal returns (uint256 requiredCollateral) {
        self.kind = IFoilStructs.PositionKind.Liquidity;
        self.epochId = epoch.id;
        self.uniswapPositionId = params.uniswapNftId;
        self.borrowedVGas += params.additionalLoanAmount0;
        self.borrowedVEth += params.additionalLoanAmount1;

        (uint256 loanAmount0, uint256 loanAmount1) = (
            self.borrowedVGas > params.tokensOwed0
                ? self.borrowedVGas - params.tokensOwed0
                : 0,
            self.borrowedVEth > params.tokensOwed1
                ? self.borrowedVEth - params.tokensOwed1
                : 0
        );

        requiredCollateral = epoch.requiredCollateralForLiquidity(
            params.liquidity,
            loanAmount0,
            loanAmount1,
            TickMath.getSqrtRatioAtTick(params.lowerTick),
            TickMath.getSqrtRatioAtTick(params.upperTick)
        );

        uint256 newCollateral = self.depositedCollateralAmount +
            params.additionalCollateral;

        if (newCollateral < requiredCollateral) {
            revert Errors.InsufficientCollateral(
                newCollateral,
                requiredCollateral
            );
        }

        updateCollateral(self, requiredCollateral);
    }

    function settle(
        Data storage self,
        uint256 settlementPriceD18
    ) internal returns (uint256 collateralAmountReturned) {
        // convert everything to ETH
        if (self.vGasAmount > 0) {
            self.vEthAmount += (self.vGasAmount * settlementPriceD18) / 1e18;
        }
        if (self.borrowedVGas > 0) {
            self.borrowedVEth +=
                (self.borrowedVGas * settlementPriceD18) /
                1e18;
        }

        self.isSettled = true;

        self.depositedCollateralAmount += self.vEthAmount - self.borrowedVEth;
        return self.depositedCollateralAmount;
    }

    function consolidateDebtsAndTokens(Data storage self) internal {
        if (self.borrowedVEth > self.vEthAmount) {
            self.borrowedVEth -= self.vEthAmount;
            self.vEthAmount = 0;
        } else {
            self.vEthAmount -= self.borrowedVEth;
            self.borrowedVEth = 0;
        }

        if (self.borrowedVGas > self.vGasAmount) {
            self.borrowedVGas -= self.vGasAmount;
            self.vGasAmount = 0;
        } else {
            self.vGasAmount -= self.borrowedVGas;
            self.borrowedVGas = 0;
        }

        // Size of the position is the amount of vGas and direction depends on the kind
        // TODO remove currentTokenAmount and get it from the position size
        self.currentTokenAmount =
            self.vGasAmount.toInt() -
            self.borrowedVGas.toInt();
    }
}

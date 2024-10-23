// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {Epoch} from "../storage/Epoch.sol";
import {Market} from "../storage/Market.sol";
import {IUMASettlementModule} from "../interfaces/IUMASettlementModule.sol";
import {OptimisticOracleV3Interface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "../libraries/DecimalPrice.sol";

// import "forge-std/console2.sol";

contract UMASettlementModule is
    IUMASettlementModule,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using Epoch for Epoch.Data;

    function submitSettlementPrice(
        uint256 epochId,
        uint160 settlementSqrtPriceX96
    ) external nonReentrant returns (bytes32) {
        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.loadValid(epochId);

        validateSubmission(epoch, market, msg.sender);

        IERC20 bondCurrency = IERC20(epoch.params.bondCurrency);
        OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(
                epoch.params.optimisticOracleV3
            );

        bondCurrency.safeTransferFrom(
            msg.sender,
            address(this),
            epoch.params.bondAmount
        );
        bondCurrency.approve(
            address(optimisticOracleV3),
            epoch.params.bondAmount
        );

        bytes memory claim = abi.encodePacked(
            "ipfs://Qmbg1KiuKNmCbL696Zu8hXUAJrTxuhgNCbyjaPyni4RXTc evaluates to ",
            Strings.toString(settlementSqrtPriceX96),
            " ",
            epoch.params.priceUnit,
            " with start time ",
            Strings.toString(epoch.startTime),
            " and end time ",
            Strings.toString(epoch.endTime)
        );

        epoch.assertionId = optimisticOracleV3.assertTruth(
            claim,
            msg.sender,
            address(this),
            address(0),
            epoch.params.assertionLiveness,
            IERC20(epoch.params.bondCurrency),
            epoch.params.bondAmount,
            optimisticOracleV3.defaultIdentifier(),
            bytes32(0)
        );

        market.epochIdByAssertionId[epoch.assertionId] = epochId;

        epoch.settlement = Epoch.Settlement({
            settlementPriceSqrtX96: settlementSqrtPriceX96,
            submissionTime: block.timestamp,
            disputed: false,
            disputer: address(0)
        });

        emit SettlementSubmitted(
            epochId,
            settlementSqrtPriceX96,
            block.timestamp
        );

        return epoch.assertionId;
    }

    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external {
        assertedTruthfully;
        Market.Data storage market = Market.load();
        uint256 epochId = market.epochIdByAssertionId[assertionId];
        Epoch.Data storage epoch = Epoch.load(epochId);

        validateUMACallback(epoch, msg.sender, assertionId);

        Epoch.Settlement storage settlement = epoch.settlement;

        if (!epoch.settlement.disputed) {
            epoch.setSettlementPriceInRange(
                DecimalPrice.sqrtRatioX96ToPrice(
                    settlement.settlementPriceSqrtX96
                )
            );
            epoch.settled = true;

            // Call the callback recipient
            if (address(market.callbackRecipient) != address(0)) {
                market.callbackRecipient.resolutionCallback(
                    settlement.settlementPriceSqrtX96
                );
            }

            emit EpochSettled(
                epochId,
                assertionId,
                settlement.settlementPriceSqrtX96
            );
        }
    }

    function assertionDisputedCallback(
        bytes32 assertionId
    ) external nonReentrant {
        Market.Data storage market = Market.load();
        uint256 epochId = market.epochIdByAssertionId[assertionId];
        Epoch.Data storage epoch = Epoch.load(epochId);

        validateUMACallback(epoch, msg.sender, assertionId);

        Epoch.Settlement storage settlement = epoch.settlement;
        settlement.disputed = true;

        emit SettlementDisputed(epochId, block.timestamp);
    }

    function validateSubmission(
        Epoch.Data storage epoch,
        Market.Data storage market,
        address caller
    ) internal view {
        require(
            block.timestamp > epoch.endTime,
            "Market epoch activity is still allowed"
        );
        require(!epoch.settled, "Market epoch already settled");
        require(caller == market.owner, "Only owner can call this function");
    }

    function validateUMACallback(
        Epoch.Data storage epoch,
        address caller,
        bytes32 assertionId
    ) internal view {
        OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(
                epoch.params.optimisticOracleV3
            );

        require(
            block.timestamp > epoch.endTime,
            "Market epoch activity is still allowed"
        );
        require(!epoch.settled, "Market epoch already settled");
        require(caller == address(optimisticOracleV3), "Invalid caller");
        require(assertionId == epoch.assertionId, "Invalid assertionId");
    }
}

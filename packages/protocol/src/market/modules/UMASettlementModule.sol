// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {Market} from "../storage/Market.sol";
import {MarketGroup} from "../storage/MarketGroup.sol";
import {IUMASettlementModule} from "../interfaces/IUMASettlementModule.sol";
import {OptimisticOracleV3Interface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "../libraries/DecimalPrice.sol";

contract UMASettlementModule is
    IUMASettlementModule,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using Market for Market.Data;
    using MarketGroup for MarketGroup.Data;

    function submitSettlementPrice(
        uint256 marketId,
        address asserter,
        uint160 settlementSqrtPriceX96
    ) external nonReentrant returns (bytes32) {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        Market.Data storage market = Market.loadValid(marketId);

        validateSubmission(market, marketGroup, msg.sender);

        require(
            market.assertionId == bytes32(0),
            "Assertion already submitted"
        );

        IERC20 bondCurrency = IERC20(marketGroup.marketParams.bondCurrency);
        OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(
                marketGroup.marketParams.optimisticOracleV3
            );

        bondCurrency.safeTransferFrom(
            msg.sender,
            address(this),
            marketGroup.marketParams.bondAmount
        );
        bondCurrency.approve(
            address(optimisticOracleV3),
            marketGroup.marketParams.bondAmount
        );

        uint256 decimalPrice = DecimalPrice.sqrtRatioX96ToPrice(
            settlementSqrtPriceX96
        );

        bytes memory claim = abi.encodePacked(
            string(market.claimStatement),
            Strings.toString(decimalPrice),
            "."
        );

        market.assertionId = optimisticOracleV3.assertTruth(
            claim,
            asserter,
            address(this),
            address(0),
            marketGroup.marketParams.assertionLiveness,
            IERC20(marketGroup.marketParams.bondCurrency),
            marketGroup.marketParams.bondAmount,
            optimisticOracleV3.defaultIdentifier(),
            bytes32(0)
        );

        marketGroup.marketIdByAssertionId[market.assertionId] = marketId;

        market.settlement = Market.Settlement({
            settlementPriceSqrtX96: settlementSqrtPriceX96,
            submissionTime: block.timestamp,
            disputed: false
        });

        emit SettlementSubmitted(
            marketId,
            asserter,
            settlementSqrtPriceX96,
            block.timestamp
        );

        return market.assertionId;
    }

    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external {
        assertedTruthfully;
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        uint256 marketId = marketGroup.marketIdByAssertionId[assertionId];
        Market.Data storage market = Market.load(marketId);

        validateUMACallback(market, msg.sender, assertionId);

        Market.Settlement storage settlement = market.settlement;

        if (!market.settlement.disputed) {
            market.setSettlementPriceInRange(
                DecimalPrice.sqrtRatioX96ToPrice(
                    settlement.settlementPriceSqrtX96
                )
            );

            emit MarketSettled(
                marketId,
                assertionId,
                settlement.settlementPriceSqrtX96
            );
        }

        // clear the assertionId
        market.assertionId = bytes32(0);
    }

    function assertionDisputedCallback(
        bytes32 assertionId
    ) external nonReentrant {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        uint256 marketId = marketGroup.marketIdByAssertionId[assertionId];
        Market.Data storage market = Market.load(marketId);

        validateUMACallback(market, msg.sender, assertionId);

        Market.Settlement storage settlement = market.settlement;
        settlement.disputed = true;

        emit SettlementDisputed(marketId, block.timestamp);
    }

    function validateSubmission(
        Market.Data storage market,
        MarketGroup.Data storage marketGroup,
        address caller
    ) internal view {
        require(
            block.timestamp >= market.endTime,
            "Market activity is still allowed"
        );
        require(!market.settled, "Market already settled");
        require(
            caller == marketGroup.owner,
            "Only owner can call this function"
        );
    }

    function validateUMACallback(
        Market.Data storage market,
        address caller,
        bytes32 assertionId
    ) internal view {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(
                marketGroup.marketParams.optimisticOracleV3
            );

        require(
            block.timestamp > market.endTime,
            "Market activity is still allowed"
        );
        require(!market.settled, "Market already settled");
        require(caller == address(optimisticOracleV3), "Invalid caller");
        require(assertionId == market.assertionId, "Invalid assertionId");
    }
}

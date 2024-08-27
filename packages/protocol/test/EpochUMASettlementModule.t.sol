// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../src/contracts/interfaces/IFoil.sol";
import {IFoilStructs} from "../src/contracts/interfaces/IFoilStructs.sol";
import {IMintableToken} from "../src/contracts/external/IMintableToken.sol";
import {TickMath} from "../src/contracts/external/univ3/TickMath.sol";
import {TestEpoch} from "./helpers/TestEpoch.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/contracts/libraries/DecimalPrice.sol";

import "forge-std/console2.sol";

contract UmaSettleMarket is TestEpoch {
    using Cannon for Vm;

    IFoil foil;
    IMintableToken bondCurrency;

    uint256 epochId;
    address owner;
    address optimisticOracleV3;
    uint256 endTime;
    uint256 minPriceD18;
    uint256 maxPriceD18;
    IFoilStructs.EpochParams epochParams;

    function setUp() public {
        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));

        uint160 startingSqrtPriceX96 = 250541448375047931186413801569; // 10
        (foil, ) = createEpoch(16000, 29800, startingSqrtPriceX96);

        (owner, , , , optimisticOracleV3, ) = foil.getMarket();
        (
            epochId,
            ,
            endTime,
            ,
            ,
            ,
            minPriceD18,
            maxPriceD18,
            ,
            ,
            epochParams
        ) = foil.getLatestEpoch();

        bondCurrency.mint(epochParams.bondAmount * 2, owner);
    }

    function test_only_owner_settle() public {
        vm.warp(endTime + 1);
        vm.expectRevert("Only owner can call this function");
        foil.submitSettlementPrice(epochId, 11 ether);
    }

    function test_settle_in_range() public {
        bool settled;
        uint256 settlementPriceD18;

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(epochId, 10 ether);
        vm.stopPrank();

        (, , , , , , , , settled, settlementPriceD18, ) = foil.getLatestEpoch();
        assertTrue(!settled, "The epoch isn't settled");

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (, , , , , , , , settled, settlementPriceD18, ) = foil.getLatestEpoch();
        assertTrue(settled, "The epoch is settled");
        assertTrue(
            settlementPriceD18 == 10 ether,
            "The settlement price is as submitted"
        );
    }

    function test_settle_above_range() public {
        (, , , , , , uint256 minPriceD18, uint256 maxPriceD18, , , ) = foil
            .getLatestEpoch();

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(
            epochId,
            maxPriceD18 + 1
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (, , , , , , , , , uint256 settlementPriceD18, ) = foil
            .getLatestEpoch();
        assertTrue(
            settlementPriceD18 == maxPriceD18,
            "The settlement price is the maximum"
        );
    }

    function test_settle_below_range() public {
        (, , , , , , uint256 minPriceD18, uint256 maxPriceD18, , , ) = foil
            .getLatestEpoch();

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(
            epochId,
            minPriceD18 - 1
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (, , , , , , , , , uint256 settlementPriceD18, ) = foil
            .getLatestEpoch();
        assertTrue(
            settlementPriceD18 == minPriceD18,
            "The settlement price is the minimum"
        );
    }

    function test_settle_too_early() public {
        vm.warp(endTime - 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        vm.expectRevert("Market activity is still allowed");
        bytes32 assertionId = foil.submitSettlementPrice(
            epochId,
            minPriceD18 - 1
        );
        vm.stopPrank();
    }

    function test_settle_too_late() public {
        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(epochId, 10 ether);
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        vm.expectRevert("Market already settled");
        bytes32 assertionId2 = foil.submitSettlementPrice(epochId, 10 ether);
        vm.stopPrank();
    }

    function test_settle_after_dispute() public {
        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(epochId, 10 ether);
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionDisputedCallback(assertionId);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (, , , , , , , , bool settled, , ) = foil.getLatestEpoch();
        assertTrue(!settled, "The epoch is not settled");

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId2 = foil.submitSettlementPrice(epochId, 11 ether);
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        foil.assertionResolvedCallback(assertionId2, true);
        vm.stopPrank();

        (, , , , , , , , , uint256 settlementPriceD18, ) = foil
            .getLatestEpoch();
        assertTrue(
            settlementPriceD18 == 11 ether,
            "The settlement price is the undisputed value"
        );
    }
}

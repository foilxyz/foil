// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface IConfigurationModule {
    event MarketInitialized(
        address initialOwner,
        address collateralAsset,
        address feeCollectorNFT,
        address callbackRecipient,
        uint256 minTradeSize,
        IFoilStructs.MarketParams marketParams
    );

    event MarketUpdated(IFoilStructs.MarketParams marketParams);

    event EpochCreated(
        uint epochId,
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        bytes claimStatement
    );

    event OwnershipTransferStarted(
        address indexed previousOwner,
        address indexed newOwner
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /**
     * @notice Initializes a market
     * @param owner Address of a market owner, which can update the configurations and submit a settlement price
     * @param collateralAsset Address of the collateral used by the market. This cannot be a rebase token.
     * @param feeCollectors Addresses of fee collectors
     * @param callbackRecipient recipient of callback on resolution of epoch, can be address(0)
     * @param minTradeSize Minimum trade size for a position
     * @param marketParams Parameters used when new epochs are created
     */
    function initializeMarket(
        address owner,
        address collateralAsset,
        address[] calldata feeCollectors,
        address callbackRecipient,
        uint256 minTradeSize,
        IFoilStructs.MarketParams memory marketParams
    ) external;

    function updateMarket(
        IFoilStructs.MarketParams memory marketParams
    ) external;

    function createEpoch(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        int24 baseAssetMinPriceTick,
        int24 baseAssetMaxPriceTick,
        uint256 salt,
        bytes calldata claimStatement
    ) external returns (uint256 epochId);
}

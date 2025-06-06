// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../external/FeeCollectorNft.sol";
import "../interfaces/IConfigurationModule.sol";
import "../storage/Market.sol";
import "../storage/Epoch.sol";
import "../storage/Errors.sol";

contract ConfigurationModule is
    IConfigurationModule,
    ReentrancyGuardUpgradeable
{
    using Market for Market.Data;

    modifier onlyOwner() {
        Market.Data storage market = Market.load();
        if (market.owner == address(0)) {
            revert Errors.MarketNotInitialized();
        }
        if (msg.sender != market.owner) {
            revert Errors.OnlyOwner();
        }
        _;
    }

    function initializeMarket(
        address initialOwner,
        address collateralAsset,
        address[] calldata feeCollectors,
        address callbackRecipient,
        uint256 minTradeSize,
        IFoilStructs.MarketParams memory marketParams
    ) external override nonReentrant {
        address feeCollectorNFT;
        if (feeCollectors.length > 0) {
            feeCollectorNFT = address(
                new FeeCollectorNft("FeeCollectorNFT", "FCNFT")
            );
            for (uint256 i = 0; i < feeCollectors.length; i++) {
                address feeCollector = feeCollectors[i];
                FeeCollectorNft(feeCollectorNFT).mint(feeCollector);
            }
        }

        Market.createValid(
            initialOwner,
            collateralAsset,
            feeCollectorNFT,
            callbackRecipient,
            minTradeSize,
            marketParams
        );
        emit MarketInitialized(
            initialOwner,
            collateralAsset,
            feeCollectorNFT,
            callbackRecipient,
            minTradeSize,
            marketParams
        );
    }

    function updateMarket(
        IFoilStructs.MarketParams memory marketParams
    ) external override onlyOwner {
        Market.updateValid(marketParams);

        emit MarketUpdated(marketParams);
    }

    function createEpoch(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        int24 baseAssetMinPriceTick,
        int24 baseAssetMaxPriceTick,
        uint256 salt,
        bytes calldata claimStatement
    ) external override nonReentrant onlyOwner returns (uint256 epochId) {
        // load the market to check if it's already created
        Market.Data storage market = Market.load();

        uint256 newEpochId = market.getNewEpochId();

        Epoch.createValid(
            newEpochId,
            startTime,
            endTime,
            startingSqrtPriceX96,
            baseAssetMinPriceTick,
            baseAssetMaxPriceTick,
            salt,
            claimStatement
        );
        emit EpochCreated(newEpochId, startTime, endTime, startingSqrtPriceX96, claimStatement);

        return newEpochId;
    }

    function transferOwnership(
        address newOwner
    ) external nonReentrant onlyOwner {
        Market.Data storage market = Market.load();
        address oldOwner = market.owner;
        market.transferOwnership(newOwner);
        emit OwnershipTransferStarted(oldOwner, newOwner);
    }

    function acceptOwnership() external nonReentrant {
        Market.Data storage market = Market.load();
        address oldOwner = market.owner;
        market.acceptOwnership();
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function pendingOwner() external view returns (address) {
        Market.Data storage market = Market.load();
        return market.pendingOwner;
    }

    function owner() external view returns (address) {
        Market.Data storage market = Market.load();
        return market.owner;
    }
}

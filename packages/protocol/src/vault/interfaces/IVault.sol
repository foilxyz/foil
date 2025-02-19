// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IFoilStructs} from "../../market/interfaces/IFoilStructs.sol";
import "./IResolutionCallback.sol";

/**
 * @title IVaultAsyncDeposit
 * @notice Interface for handling asynchronous deposits into the vault
 */
interface IVaultAsyncDeposit {
    /**
     * @notice Emitted when a deposit request is made
     * @param owner The address requesting the deposit
     * @param requestedEpochId The epoch ID when the request was made
     * @param assets The total collateral amount requested to deposit that's pending
     */
    event DepositRequest(
        address indexed owner,
        uint256 indexed requestedEpochId,
        uint256 assets
    );

    /**
     * @notice Emitted when a deposit request is withdrawn
     * @param owner The address withdrawing the request
     * @param requestedEpochId The epoch ID of the original request
     * @param assets The remaining assets in the request after withdrawal
     * @param assetsReturned The amount of assets returned to the owner
     */
    event DepositRequestWithdrawn(
        address indexed owner,
        uint256 indexed requestedEpochId,
        uint256 assets, // current assets after removal
        uint256 assetsReturned
    );

    /**
     * @notice Request to deposit assets into the vault
     * @param assets The amount of collateral to deposit into vault
     * @return pendingTxn The pending transaction details
     */
    function requestDeposit(
        uint256 assets
    ) external returns (IVault.UserPendingTransaction memory pendingTxn);

    /**
     * @notice Withdraw a subset or all collateral from the requested deposit
     * @param assets The amount of collateral to reduce the request amount by
     * @return pendingTxn The updated pending transaction details
     */
    function withdrawRequestDeposit(
        uint256 assets
    ) external returns (IVault.UserPendingTransaction memory pendingTxn);

    /**
     * @notice Get the claimable shares amount for a pending deposit
     * @dev the shares amount is calculated only after the epoch the request was made is resolved
     * @param owner The address to check
     * @return sharesAmount The amount of shares that can be claimed
     */
    function claimableDepositRequest(
        address owner
    ) external view returns (uint256 sharesAmount);
}

/**
 * @title IVaultAsyncRedeem
 * @notice Interface for handling asynchronous redemptions from the vault
 */
interface IVaultAsyncRedeem {
    /**
     * @notice Emitted when a redeem request is made
     * @param owner The address requesting the redemption
     * @param requestedEpochId The epoch ID when the request was made
     * @param shares The amount of shares requested to redeem
     */
    event RedeemRequest(
        address indexed owner,
        uint256 indexed requestedEpochId,
        uint256 shares
    );

    /**
     * @notice Emitted when a redeem request amount is reduced
     * @param owner The address withdrawing the request
     * @param requestedEpochId The epoch ID of the original request
     * @param shares The remaining shares in the request after withdrawal
     * @param sharesReturned The amount of shares that were reduced from the request
     */
    event RedeemRequestWithdrawn(
        address indexed owner,
        uint256 indexed requestedEpochId,
        uint256 shares,
        uint256 sharesReturned
    );

    /**
     * @notice Request to redeem shares from the vault
     * @dev can be made multiple times and the shares will be added to the request
     * @param shares The amount of shares to redeem
     * @return pendingTxn The pending transaction details
     */
    function requestRedeem(
        uint256 shares
    ) external returns (IVault.UserPendingTransaction memory pendingTxn);

    /**
     * @notice Reduce by the amount of shares passed in
     * @dev requires a redeem request in flight
     * @param shares The amount of shares to withdraw from the request
     * @return pendingTxn The updated pending transaction details
     */
    function withdrawRequestRedeem(
        uint256 shares
    ) external returns (IVault.UserPendingTransaction memory pendingTxn);

    /**
     * @notice Get the claimable collateral amount for a pending redemption
     * @dev the collateral amount is calculated only after the epoch the request was made is resolved
     * @param owner The address to check
     * @return collateralAmount The amount of collateral that can be claimed
     */
    function claimableRedeemRequest(
        address owner
    ) external view returns (uint256 collateralAmount);

    /**
     * @notice Redeem shares for collateral
     * @dev the request must have been made in a previous epoch
     * @param owner The address redeeming shares
     * @return assets The amount of collateral redeemed
     */
    function redeem(address owner) external returns (uint256 assets);

    /**
     * @notice Withdraw assets for shares
     * @dev alias for redeem
     * @param owner The address withdrawing
     * @return sharesAmount The amount of shares withdrawn
     */
    function withdraw(address owner) external returns (uint256 sharesAmount);
}

/**
 * @title IVaultViews
 * @notice Interface for view functions of the vault
 * @dev not sure why i wasn't able to access them directly even though they are public
 */
interface IVaultViews {
    /**
     * @notice Get pending values for the vault
     * @return Three uint256 values representing pending amounts
     */
    function pendingValues() external view returns (uint256, uint256, uint256);

    /**
     * @notice Get the pending deposit/withdraw request for an address
     * @param owner The address to check
     * @return pendingTxn The pending transaction details
     */
    function pendingRequest(
        address owner
    ) external view returns (IVault.UserPendingTransaction memory);

    /**
     * @notice Get the share price for a specific epoch
     * @param epochId The epoch ID to query
     * @return The share price for the epoch
     */
    function epochSharePrice(uint256 epochId) external view returns (uint256);

    /**
     * @notice Get the current position ID
     * @return The position ID
     */
    function getPositionId() external view returns (uint256);

    /**
     * @notice Get the current epoch data and market parameters
     * @return epochData The current epoch on the foil market's data
     */
    function getCurrentEpoch()
        external
        view
        returns (IFoilStructs.EpochData memory epochData);

    /**
     * @notice Check if the vault is halted
     * @return bool True if the vault is halted, false otherwise
     */
    function isHalted() external view returns (bool);
}

/**
 * @title IVault
 * @notice Main vault interface combining all vault functionality
 */
interface IVault is
    IERC4626,
    IVaultAsyncDeposit,
    IVaultAsyncRedeem,
    IResolutionCallback,
    IVaultViews
{
    /**
     * @notice Transaction types for pending transactions
     */
    enum TransactionType {
        NULL,
        DEPOSIT,
        WITHDRAW
    }

    /**
     * @notice Structure for pending user transactions
     * @param amount The amount of collateral or shares depending on type
     * @param transactionType The type of transaction (deposit/withdraw)
     * @param requestInitiatedEpoch The epoch when the request was initiated
     */
    struct UserPendingTransaction {
        uint256 amount;
        TransactionType transactionType;
        uint256 requestInitiatedEpoch;
    }

    /**
     * @notice Emitted when an epoch is settled and the callback is called
     * @param epochId The ID of the processed epoch
     * @param newSharePrice The new share price after processing
     */
    event EpochProcessed(uint256 indexed epochId, uint256 newSharePrice);

    event VaultPositionSettled(
        uint256 indexed epochId,
        uint256 collateralReceived
    );

    /**
     * @notice Emitted when the creation of the new epoch or position fails
     * @dev this is a temporary halt and the vault can be resumed by calling the `createNewEpochAndPosition` function
     * @param reason The reason the vault was halted
     * @param collateralReceived The amount of collateral received from the previous epoch's vault position
     */
    event VaultHalted(bytes reason, uint256 collateralReceived);

    /**
     * @notice Initialize the first epoch of the vault
     * @param initialSqrtPriceX96 The initial sqrt price
     * @param initialStartTime The initial start time of the epoch from which
     */
    function initializeFirstEpoch(
        uint160 initialSqrtPriceX96,
        uint256 initialStartTime
    ) external;

    /**
     * @notice Submit the market settlement price for an epoch
     * @notice ***WARNING*** msg.sender receives the bond amount so if it's a contract, please be wary of this.
     * @param epochId The epoch ID to settle
     * @param priceSqrtX96 The settlement price in sqrt form
     * @return assertionId The ID of the settlement assertion
     */
    function submitMarketSettlementPrice(
        uint256 epochId,
        uint160 priceSqrtX96
    ) external returns (bytes32 assertionId);

    function forceSettlePosition()
        external
        returns (uint256 sharePrice, uint256 collateralReceived);

    function createNewEpochAndPosition(
        uint256 startTime,
        uint160 previousResolutionSqrtPriceX96,
        uint256 previousEpochCollateralReceived
    ) external;
}

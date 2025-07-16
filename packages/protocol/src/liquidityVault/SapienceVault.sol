// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./market/interfaces/IFoil.sol";
import "./market/interfaces/IFoilStructs.sol";
import "./market/interfaces/ILiquidityModule.sol";
import "./market/interfaces/IViewsModule.sol";
import "./market/interfaces/ISettlementModule.sol";
import "./market/interfaces/ISapienceStructs.sol";
import "./market/external/univ3/TickMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

struct PredictionData {
    address marketAddress;
    uint256 marketId;
    uint160 prediction; // 0 = max short, type(uint160).max/2 = neutral, type(uint160).max = max long
}

struct LiquidityPositionPair {
    uint256 upperPositionId;  // LP position above the prediction
    uint256 lowerPositionId;  // LP position below the prediction
}

contract SapienceVault is ReentrancyGuard {
    // Constants
    uint256 public constant PREDICTION_SCALE = 1e18;
    uint256 public constant PROFIT_CONTRIBUTION_PERCENTAGE = 2; // 2% contribution on profits
    
    // LP Hyperparameters
    int24 public constant SPREAD = 200; // Number of ticks on both sides of prediction
    int24 public constant POSITION_WIDTH = 100; // Number of ticks each LP position should cover
    
    // Core vault state
    IERC20 public immutable token;
    address public immutable factory;
    address public immutable owner; // The prediction submitter/vault owner
    
    // Vault accounting: sender => amount
    mapping(address => uint256) public deposits;
    uint256 public totalDeposits;
    
    // Contribution tracking: total contributions collected
    uint256 public contributionsCollected;
    
    // Position tracking: marketId => LP position pair
    mapping(uint256 => LiquidityPositionPair) public vaultLiquidityPositions;
    
    // Track active positions with market context: positionId => marketAddress
    mapping(uint256 => address) public positionToMarket;
    
    // Track all active position IDs: positionId[]
    uint256[] public vaultActivePositions;
    
    // Track position index for efficient removal: positionId => index
    mapping(uint256 => uint256) private positionIndex;
    
    // Reverse mapping for efficient lookup: positionId => marketId
    mapping(uint256 => uint256) private positionToMarketId;

    // Store active predictions: marketId => prediction data
    mapping(uint256 => PredictionData) public activePredictions;
    
    // Track which markets have active predictions for efficient iteration
    uint256[] public activeMarkets;
    
    // Track market index for efficient removal: marketId => index in activeMarkets array
    mapping(uint256 => uint256) private marketIndex;
    
    // Events
    event Deposit(address indexed sender, uint256 amount);
    event Withdraw(address indexed sender, uint256 amount, uint256 value);
    event ProfitContributionCollected(address indexed sender, uint256 contributionAmount, uint256 profit);
    event ContributionsRedeemed(address indexed owner, uint256 amount);
    event LiquidityPositionsRebalanced(
        address indexed marketAddress, 
        uint256 indexed marketId, 
        uint256 upperPositionId,
        uint256 lowerPositionId,
        int24 predictionTick,
        uint160 prediction
    );
    event LiquidityPositionSettled(
        address indexed marketAddress,
        uint256 indexed positionId,
        uint256 marketId
    );
    event LiquidityPositionClosedByRevocation(
        address indexed marketAddress,
        uint256 indexed upperPositionId,
        uint256 indexed lowerPositionId,
        uint256 marketId
    );
    event AllPositionsClosed(uint256 positionsClosedCount, uint256 totalBalance);
    event PredictionStored(uint256 indexed marketId, address indexed marketAddress, uint160 prediction);
    event PredictionRemoved(uint256 indexed marketId);
    
    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory can call");
        _;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }
    
    constructor(address _token, address _factory, address _owner) {
        require(_token != address(0), "Invalid token");
        require(_factory != address(0), "Invalid factory");
        require(_owner != address(0), "Invalid owner");
        token = IERC20(_token);
        factory = _factory;
        owner = _owner;
    }
    
    /// @notice Clean rebalancing: close all positions, then redistribute based on active predictions
    function rebalanceAllPositions() internal {
        // Step 1: Settle any settleable positions first
        settleAllPositions();
        
        // Step 2: Close all active positions and get total available balance
        uint256 totalBalance = _closeAllActivePositions();
        
        // Step 3: Redistribute equally across all active predictions
        if (totalBalance > 0 && activeMarkets.length > 0) {
            _redistributeFromActivePredictions(totalBalance);
        }
    }

    /// @notice Close all active positions and return total available balance
    function _closeAllActivePositions() internal returns (uint256 totalBalance) {
        uint256 positionsClosedCount = 0;
        
        // Close positions in reverse order to avoid array shifting issues
        while (vaultActivePositions.length > 0) {
            uint256 positionId = vaultActivePositions[vaultActivePositions.length - 1];
            address marketAddress = positionToMarket[positionId];
            
            if (marketAddress != address(0)) {
                try ILiquidityModule(marketAddress).closeLiquidityPosition(
                    ISapienceStructs.LiquidityCloseParams({
                        positionId: positionId,
                        liquiditySlippage: 100e16, // 100% slippage tolerance for emergency close
                        tradeSlippage: 100e16, // 100% slippage tolerance for emergency close
                        deadline: block.timestamp + 300
                    })
                ) {
                    positionsClosedCount++;
                } catch {
                    // Log failed close but continue with others
                    // In production, consider more sophisticated error handling
                }
            }
            
            // Always remove from tracking even if close failed
            _removePositionFromVault(positionId);
        }
        
        // Clear all position mappings (vaultPositions mapping)
        for (uint256 i = 0; i < activeMarkets.length; i++) {
            uint256 marketId = activeMarkets[i];
            delete vaultLiquidityPositions[marketId];
        }
        
        totalBalance = getAvailableBalance();
        emit AllPositionsClosed(positionsClosedCount, totalBalance);
        
        return totalBalance;
    }
    
    /// @notice Redistribute available balance equally across all active predictions
    function _redistributeFromActivePredictions(uint256 totalBalance) internal {
        uint256 predictionCount = activeMarkets.length;
        if (predictionCount == 0) return;
        
        // Equal allocation per prediction
        uint256 allocationPerPrediction = totalBalance / predictionCount;
        if (allocationPerPrediction == 0) return;
        
        // Create positions for each active prediction
        for (uint256 i = 0; i < activeMarkets.length; i++) {
            uint256 marketId = activeMarkets[i];
            PredictionData memory predictionData = activePredictions[marketId];
            
            // Calculate target size based on prediction vs current price
            uint256 currentPrice = _getCurrentMarketPrice(predictionData.marketAddress, marketId);
            if (currentPrice == 0) continue; // Skip if we can't get price
            
            int24 predictionTick = _calculatePredictionTick(
                predictionData.prediction,
                currentPrice
            );
            
            if (predictionTick != 0) {
                // Create new position
                try _createLiquidityPosition(
                    ILiquidityModule(predictionData.marketAddress),
                    marketId,
                    predictionTick,
                    allocationPerPrediction
                ) returns (uint256 upperPositionId, uint256 lowerPositionId) {
                    // Track the new position
                    vaultLiquidityPositions[marketId] = LiquidityPositionPair({
                        upperPositionId: upperPositionId,
                        lowerPositionId: lowerPositionId
                    });
                    _addPositionToVault(upperPositionId, predictionData.marketAddress, marketId);
                    _addPositionToVault(lowerPositionId, predictionData.marketAddress, marketId);
                    
                    emit LiquidityPositionsRebalanced(
                        predictionData.marketAddress,
                        marketId,
                        upperPositionId,
                        lowerPositionId,
                        predictionTick,
                        predictionData.prediction
                    );
                } catch {
                    // Failed to create position for this prediction, continue with others
                    continue;
                }
            }
        }
    }
    
    /// @notice Store a prediction for future rebalancing
    function _storePrediction(PredictionData memory predictionData) internal {
        uint256 marketId = predictionData.marketId;
        
        // Check if this is a new market
        bool isNewMarket = activePredictions[marketId].marketAddress == address(0);
        
        // Store the prediction data
        activePredictions[marketId] = predictionData;
        
        if (isNewMarket) {
            // Add to active markets array
            activeMarkets.push(marketId);
            marketIndex[marketId] = activeMarkets.length - 1;
        }
        
        emit PredictionStored(marketId, predictionData.marketAddress, predictionData.prediction);
    }
    
    /// @notice Remove a prediction (called when position is closed by revocation)
    function _removePrediction(uint256 marketId) internal {
        // Check if prediction exists
        if (activePredictions[marketId].marketAddress == address(0)) return;
        
        // Remove from activeMarkets array
        uint256 index = marketIndex[marketId];
        uint256 lastIndex = activeMarkets.length - 1;
        
        if (index != lastIndex) {
            // Move last element to deleted spot
            uint256 lastMarketId = activeMarkets[lastIndex];
            activeMarkets[index] = lastMarketId;
            marketIndex[lastMarketId] = index;
        }
        
        // Remove last element
        activeMarkets.pop();
        
        // Clean up mappings
        delete marketIndex[marketId];
        delete activePredictions[marketId];
        
        emit PredictionRemoved(marketId);
    }

    /// @notice Deposit tokens to the vault
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Invalid amount");
        
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        deposits[msg.sender] += amount;
        totalDeposits += amount;
        
        // Settle any settleable positions first
        settleAllPositions();
        
        // Rebalance with new funds using clean approach
        rebalanceAllPositions();
        
        emit Deposit(msg.sender, amount);
    }
    
    /// @notice Withdraw pro-rata share from vault with profit contribution
    function withdraw(uint256 depositAmount) external nonReentrant {
        require(depositAmount > 0, "Invalid amount");
        require(deposits[msg.sender] >= depositAmount, "Insufficient deposits");
        
        // Settle any settleable positions first
        settleAllPositions();
        
        uint256 totalValue = getTotalValue();
        uint256 userShare = totalDeposits > 0 
            ? (depositAmount * totalValue) / totalDeposits 
            : 0;
        
        // Calculate withdrawal percentage for position reduction
        uint256 withdrawalPercentage = totalDeposits > 0 
            ? (depositAmount * 1e18) / totalDeposits
            : 0;
        
        // Use clean rebalancing approach: close all, then reopen with reduced capital
        if (withdrawalPercentage > 0 && withdrawalPercentage < 1e18) {
            // Partial withdrawal - rebalance with reduced total deposits
            uint256 newTotalDeposits = totalDeposits - depositAmount;
            deposits[msg.sender] -= depositAmount;
            totalDeposits = newTotalDeposits;
            
            // Clean rebalance with new total
            rebalanceAllPositions();
        } else {
            // Full withdrawal - close everything
            _closeAllActivePositions();
            deposits[msg.sender] -= depositAmount;
            totalDeposits -= depositAmount;
        }
        
        // Recalculate available balance after rebalancing
        uint256 updatedAvailableBalance = getAvailableBalance();
        require(userShare <= updatedAvailableBalance, "Insufficient liquidity after rebalancing");
        
        uint256 actualWithdrawal = userShare;
        uint256 contributionAmount = 0;
        
        // Calculate profit contribution if user has made a profit
        if (userShare > depositAmount) {
            uint256 profit = userShare - depositAmount;
            contributionAmount = (profit * PROFIT_CONTRIBUTION_PERCENTAGE) / 100;
            actualWithdrawal = userShare - contributionAmount;
            
            // Track the contribution for the vault
            contributionsCollected += contributionAmount;
            
            emit ProfitContributionCollected(msg.sender, contributionAmount, profit);
        }
        
        require(token.transfer(msg.sender, actualWithdrawal), "Transfer failed");
        
        emit Withdraw(msg.sender, depositAmount, actualWithdrawal);
    }
    
    /// @notice Get total value of vault (token balance + unrealized PnL + contributions)
    function getTotalValue() public view returns (uint256) {
        if (totalDeposits == 0) return 0;
        
        // Calculate base token balance (this includes contributions collected)
        uint256 baseBalance = token.balanceOf(address(this));
        
        // Add unrealized PnL from all positions
        int256 totalPnL = _getAggregatedPnL();
        
        // Calculate total value (base + PnL, but never below 0)
        if (totalPnL >= 0) {
            return baseBalance + uint256(totalPnL);
        } else {
            uint256 loss = uint256(-totalPnL);
            return baseBalance > loss ? baseBalance - loss : 0;
        }
    }
    
    /// @notice Get unrealized PnL for a specific position
    function getPositionPnL(address marketAddress, uint256 marketId) public view returns (int256 pnl) {
        uint256 upperPositionId = vaultLiquidityPositions[marketId].upperPositionId;
        uint256 lowerPositionId = vaultLiquidityPositions[marketId].lowerPositionId;

        if (upperPositionId == 0 || lowerPositionId == 0) return 0;
        
        try IViewsModule(marketAddress).getPositionPnl(upperPositionId) returns (int256 upperPnl) {
            try IViewsModule(marketAddress).getPositionPnl(lowerPositionId) returns (int256 lowerPnl) {
                return upperPnl + lowerPnl;
            } catch {
                return upperPnl;
            }
        } catch {
            return 0;
        }
    }
    
    /// @notice Get aggregated PnL across all positions
    function _getAggregatedPnL() internal view returns (int256 totalPnL) {
        for (uint256 i = 0; i < vaultActivePositions.length; i++) {
            uint256 positionId = vaultActivePositions[i];
            address marketAddress = positionToMarket[positionId];
            
            if (marketAddress != address(0)) {
                try IViewsModule(marketAddress).getPositionPnl(positionId) returns (int256 positionPnl) {
                    totalPnL += positionPnl;
                } catch {
                    // Continue if position query fails
                    continue;
                }
            }
        }
        
        return totalPnL;
    }
    
    /// @notice Emergency function to close position
    function closePosition(uint256 marketId) external onlyOwner nonReentrant {
        require(totalDeposits > 0, "Invalid vault");
        
        LiquidityPositionPair memory positionPair = vaultLiquidityPositions[marketId];
        uint256 upperPositionId = positionPair.upperPositionId;
        uint256 lowerPositionId = positionPair.lowerPositionId;

        require(upperPositionId > 0 && lowerPositionId > 0, "No position");
        
        address marketAddress = positionToMarket[upperPositionId];
        require(marketAddress != address(0), "Market not found");
        
        // Close upper position using proper struct interface
        ILiquidityModule(marketAddress).closeLiquidityPosition(
            ISapienceStructs.LiquidityCloseParams({
                positionId: upperPositionId,
                liquiditySlippage: 5e16, // 5% slippage tolerance
                tradeSlippage: 5e16, // 5% slippage tolerance
                deadline: block.timestamp + 300
            })
        );

        marketAddress = positionToMarket[lowerPositionId];
        require(marketAddress != address(0), "Market not found");

        // Close lower position using proper struct interface
        ILiquidityModule(marketAddress).closeLiquidityPosition(
            ISapienceStructs.LiquidityCloseParams({
                positionId: lowerPositionId,
                liquiditySlippage: 5e16, // 5% slippage tolerance
                tradeSlippage: 5e16, // 5% slippage tolerance
                deadline: block.timestamp + 300
            })
        );
        
        // Clear position tracking
        delete vaultLiquidityPositions[marketId];
        _removePositionFromVault(upperPositionId);
        _removePositionFromVault(lowerPositionId);
        
        // Remove prediction as well
        _removePrediction(marketId);
    }
    
    /// @notice Close position when attestation is revoked (called by factory)
    function closePositionByFactory(uint256 marketId) external onlyFactory nonReentrant {
        require(totalDeposits > 0, "Invalid vault");
        
        LiquidityPositionPair memory positionPair = vaultLiquidityPositions[marketId];
        uint256 upperPositionId = positionPair.upperPositionId;
        uint256 lowerPositionId = positionPair.lowerPositionId;

        require(upperPositionId > 0 && lowerPositionId > 0, "No position");
        
        address marketAddress = positionToMarket[upperPositionId];
        require(marketAddress != address(0), "Market not found");
        
        // Close upper position using proper struct interface
        ILiquidityModule(marketAddress).closeLiquidityPosition(
            ISapienceStructs.LiquidityCloseParams({
                positionId: upperPositionId,
                liquiditySlippage: 5e16, // 5% slippage tolerance
                tradeSlippage: 5e16, // 5% slippage tolerance
                deadline: block.timestamp + 300
            })
        );

        marketAddress = positionToMarket[lowerPositionId];
        require(marketAddress != address(0), "Market not found");

        // Close lower position using proper struct interface
        ILiquidityModule(marketAddress).closeLiquidityPosition(
            ISapienceStructs.LiquidityCloseParams({
                positionId: lowerPositionId,
                liquiditySlippage: 5e16, // 5% slippage tolerance
                tradeSlippage: 5e16, // 5% slippage tolerance
                deadline: block.timestamp + 300
            })
        );
        
        // Clear position tracking
        delete vaultLiquidityPositions[marketId];
        _removePositionFromVault(upperPositionId);
        _removePositionFromVault(lowerPositionId);
        
        // Remove the prediction for this market
        _removePrediction(marketId);
        
        emit LiquidityPositionClosedByRevocation(marketAddress, upperPositionId, lowerPositionId, marketId);
        
        // Rebalance remaining positions using clean approach
        rebalanceAllPositions();
    }
    
    /// @notice Get available balance for trading (just token balance minus contributions)
    function getAvailableBalance() public view returns (uint256) {
        uint256 tokenBalance = token.balanceOf(address(this));
        return tokenBalance > contributionsCollected ? tokenBalance - contributionsCollected : 0;
    }
    
    /// @notice Get total unrealized PnL for the vault
    function getTotalPnL() external view returns (int256) {
        return _getAggregatedPnL();
    }
    
    /// @notice Get user's current value including PnL
    function getUserValue(address sender) external view returns (uint256) {
        if (totalDeposits == 0) return 0;
        return (deposits[sender] * getTotalValue()) / totalDeposits;
    }
    
    /// @notice Calculate potential withdrawal details including contributions
    function getWithdrawalPreview(address sender, uint256 depositAmount) 
        external view returns (
            uint256 userShare,
            uint256 profit,
            uint256 contributionAmount,
            uint256 actualWithdrawal
        ) {
        require(depositAmount > 0, "Invalid amount");
        require(deposits[sender] >= depositAmount, "Insufficient deposits");
        
        uint256 totalValue = getTotalValue();
        userShare = totalDeposits > 0 
            ? (depositAmount * totalValue) / totalDeposits 
            : 0;
        
        actualWithdrawal = userShare;
        profit = 0;
        contributionAmount = 0;
        
        // Calculate profit contribution if user has made a profit
        if (userShare > depositAmount) {
            profit = userShare - depositAmount;
            contributionAmount = (profit * PROFIT_CONTRIBUTION_PERCENTAGE) / 100;
            actualWithdrawal = userShare - contributionAmount;
        }
        
        return (userShare, profit, contributionAmount, actualWithdrawal);
    }
    
    /// @notice Check if a withdrawal would incur contributions
    function wouldIncurContributions(address sender, uint256 depositAmount) 
        external view returns (bool) {
        if (depositAmount == 0 || deposits[sender] < depositAmount) return false;
        
        uint256 totalValue = getTotalValue();
        uint256 userShare = totalDeposits > 0 
            ? (depositAmount * totalValue) / totalDeposits 
            : 0;
        
        return userShare > depositAmount;
    }
    
    /// @notice Get detailed breakdown of vault value components
    function getVaultValueBreakdown() external view returns (
        uint256 baseBalance,
        uint256 contributionsCollected_,
        int256 unrealizedPnL,
        uint256 totalValue
    ) {
        baseBalance = token.balanceOf(address(this));
        contributionsCollected_ = contributionsCollected;
        unrealizedPnL = _getAggregatedPnL();
        totalValue = getTotalValue();
        
        return (baseBalance, contributionsCollected_, unrealizedPnL, totalValue);
    }
    
    /// @notice Settle all settleable positions
    function settleAllPositions() public {
        require(totalDeposits > 0, "Invalid vault");
        
        // Copy active positions to avoid modifying array during iteration
        uint256[] memory activePositions = new uint256[](vaultActivePositions.length);
        uint256[] memory marketIdsToSettle = new uint256[](vaultActivePositions.length);
        uint256 settleCount = 0;
        
        // First pass: identify settleable positions
        for (uint256 i = 0; i < vaultActivePositions.length; i++) {
            uint256 positionId = vaultActivePositions[i];
            address marketAddress = positionToMarket[positionId];
            
            if (marketAddress != address(0)) {
                // Find marketId for this position - store for later cleanup
                uint256 marketId = _findMarketIdForPosition(positionId);
                if (marketId != 0) {
                    activePositions[settleCount] = positionId;
                    marketIdsToSettle[settleCount] = marketId;
                    settleCount++;
                }
            }
        }
        
        // Second pass: attempt to settle identified positions
        for (uint256 i = 0; i < settleCount; i++) {
            uint256 positionId = activePositions[i];
            uint256 marketId = _findMarketIdForPosition(positionId); // Re-find marketId
            address marketAddress = positionToMarket[positionId];
            
            try ISettlementModule(marketAddress).settlePosition(positionId) {
                // Settlement succeeded, remove position from tracking
                _removePositionFromVault(positionId);
                delete vaultLiquidityPositions[marketId];
                
                // Also remove the prediction since market is settled
                _removePrediction(marketId);
                
                emit LiquidityPositionSettled(marketAddress, positionId, marketId);
            } catch {
                // Position not settleable yet or already settled, continue
                continue;
            }
        }
    }
    
    /// @notice Find marketId for a given positionId
    function _findMarketIdForPosition(uint256 positionId) internal view returns (uint256) {
        return positionToMarketId[positionId];
    }

    /// @notice Process prediction and rebalance position (called by factory)
    function executePredictionRebalance(PredictionData memory predictionData) external onlyFactory nonReentrant {
        // First, store the prediction for future rebalancing
        _storePrediction(predictionData);
        
        // Then execute clean rebalancing with all predictions
        rebalanceAllPositions();
    }
    
    /// @notice Get current market price for a market
    function _getCurrentMarketPrice(address marketAddress, uint256 marketId) internal view returns (uint256) {
        try IViewsModule(marketAddress).getSqrtPriceX96(marketId) returns (uint160 sqrtPriceX96) {
            if (sqrtPriceX96 == 0) return 0; // Market might be settled
            
            try IViewsModule(marketAddress).getDecimalPriceFromSqrtPriceX96(sqrtPriceX96) returns (uint256 decimalPrice) {
                return decimalPrice;
            } catch {
                return 0;
            }
        } catch {
            return 0;
        }
    }
    


    /// @notice Calculate the tick for a given prediction
    function _calculatePredictionTick(uint160 prediction, uint256 /*currentPrice*/) internal pure returns (int24) {
        if (prediction == 0) return 0; // Cannot determine position without prediction
        
        // The prediction is already a sqrt price (uint160), so convert directly to tick
        try TickMath.getTickAtSqrtRatio(prediction) returns (int24 tick) {
            // Ensure tick is within valid bounds for creating positions with POSITION_WIDTH
            int24 minTick = TickMath.MIN_TICK + POSITION_WIDTH + SPREAD;
            int24 maxTick = TickMath.MAX_TICK - POSITION_WIDTH - SPREAD;
            
            if (tick < minTick) tick = minTick;
            if (tick > maxTick) tick = maxTick;
            
            return tick;
        } catch {
            return 0; // Invalid sqrt price
        }
    }
    
    /// @notice Create new liquidity positions using proper struct interface
    function _createLiquidityPosition(
        ILiquidityModule market,
        uint256 marketId,
        int24 predictionTick,
        uint256 availableBalance
    ) internal returns (uint256 upperPositionId, uint256 lowerPositionId) {
        // Approve collateral token for the required amount (split between two positions)
        token.approve(address(market), availableBalance);
        
        uint256 collateralPerPosition = availableBalance / 2;
        
        // Calculate tick ranges for upper and lower positions
        int24 upperLowerTick = predictionTick + SPREAD - POSITION_WIDTH;
        int24 upperUpperTick = predictionTick + SPREAD;
        int24 lowerLowerTick = predictionTick - SPREAD;
        int24 lowerUpperTick = predictionTick - SPREAD + POSITION_WIDTH;
        
        // Create upper position (above prediction)
        (upperPositionId, , , , , , ) = market.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: 0, // Let the contract calculate
                amountQuoteToken: 0, // Let the contract calculate
                collateralAmount: collateralPerPosition,
                lowerTick: upperLowerTick,
                upperTick: upperUpperTick,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 300
            })
        );

        // Create lower position (below prediction)
        (lowerPositionId, , , , , , ) = market.createLiquidityPosition(
            ISapienceStructs.LiquidityMintParams({
                marketId: marketId,
                amountBaseToken: 0, // Let the contract calculate
                amountQuoteToken: 0, // Let the contract calculate
                collateralAmount: collateralPerPosition,
                lowerTick: lowerLowerTick,
                upperTick: lowerUpperTick,
                minAmountBaseToken: 0,
                minAmountQuoteToken: 0,
                deadline: block.timestamp + 300
            })
        );
    }
    
    /// @notice Add position to vault tracking for PnL aggregation
    function _addPositionToVault(uint256 positionId, address marketAddress, uint256 marketId) internal {
        // Add to active positions array
        vaultActivePositions.push(positionId);
        
        // Track position index for efficient removal
        positionIndex[positionId] = vaultActivePositions.length - 1;
        
        // Map position to its market
        positionToMarket[positionId] = marketAddress;
        
        // Map position to its marketId for efficient lookup
        positionToMarketId[positionId] = marketId;
    }
    
    /// @notice Remove position from vault tracking
    function _removePositionFromVault(uint256 positionId) internal {
        uint256 index = positionIndex[positionId];
        uint256 lastIndex = vaultActivePositions.length - 1;
        
        if (index != lastIndex) {
            // Move last element to deleted spot
            uint256 lastPositionId = vaultActivePositions[lastIndex];
            vaultActivePositions[index] = lastPositionId;
            positionIndex[lastPositionId] = index;
        }
        
        // Remove last element
        vaultActivePositions.pop();
        
        // Clean up mappings
        delete positionIndex[positionId];
        delete positionToMarket[positionId];
        delete positionToMarketId[positionId];
    }
    
    /// @notice Get all active positions for the vault
    function getVaultActivePositions() external view returns (uint256[] memory) {
        return vaultActivePositions;
    }
    
    /// @notice Get all active markets with predictions
    function getActiveMarkets() external view returns (uint256[] memory) {
        return activeMarkets;
    }
    
    /// @notice Get prediction data for a specific market
    function getActivePrediction(uint256 marketId) external view returns (PredictionData memory) {
        return activePredictions[marketId];
    }
    
    /// @notice Get market address for a specific position
    function getPositionMarket(uint256 positionId) external view returns (address) {
        return positionToMarket[positionId];
    }
    
    /// @notice Get detailed position information
    function getPositionDetails(uint256 positionId) external view returns (
        address marketAddress,
        int256 pnl
    ) {
        marketAddress = positionToMarket[positionId];
        
        if (marketAddress != address(0)) {
            try IViewsModule(marketAddress).getPositionPnl(positionId) returns (int256 positionPnl) {
                pnl = positionPnl;
            } catch {
                pnl = 0;
            }
        }
    }
    
    /// @notice Get the owner of this vault
    function getOwner() external view returns (address) {
        return owner;
    }
    
    /// @notice Get the amount of contributions available for redemption
    function getRedeemableContributions() external view returns (uint256) {
        return contributionsCollected;
    }

    /// @notice Redeem contributions collected by the owner
    function redeemContributions() external onlyOwner nonReentrant {
        uint256 contributionAmount = contributionsCollected;
        if (contributionAmount == 0) {
            revert("No contributions to redeem");
        }

        contributionsCollected = 0;
        require(token.transfer(owner, contributionAmount), "Transfer failed");
        emit ContributionsRedeemed(owner, contributionAmount);
    }
} 
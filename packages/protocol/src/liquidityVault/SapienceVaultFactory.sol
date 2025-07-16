// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SapienceVault.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISemver {
    /// @notice Returns the version of the contract.
    /// @return The version string.
    function version() external view returns (string memory);
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

struct Attestation {
    bytes32 uid;
    bytes32 schema;
    uint64 time;
    uint64 expirationTime;
    uint64 revocationTime;
    bytes32 refUID;
    address recipient;
    address attester;
    bool revocable;
    bytes data;
}

struct PredictionData {
    address marketAddress;
    uint256 marketId;
    uint160 prediction; // 0 = max short, type(uint160).max/2 = neutral, type(uint160).max = max long
}

interface ISchemaResolver is ISemver {
    /// @notice Checks if the resolver can be sent ETH.
    /// @return Whether the resolver supports ETH transfers.
    function isPayable() external pure returns (bool);

    /// @notice Processes an attestation and verifies whether it's valid.
    /// @param attestation The new attestation.
    /// @return Whether the attestation is valid.
    function attest(Attestation calldata attestation) external payable returns (bool);

    /// @notice Processes multiple attestations and verifies whether they are valid.
    /// @param attestations The new attestations.
    /// @param values Explicit ETH amounts which were sent with each attestation.
    /// @return Whether all the attestations are valid.
    function multiAttest(
        Attestation[] calldata attestations,
        uint256[] calldata values
    ) external payable returns (bool);

    /// @notice Processes an attestation revocation and verifies if it can be revoked.
    /// @param attestation The existing attestation to be revoked.
    /// @return Whether the attestation can be revoked.
    function revoke(Attestation calldata attestation) external payable returns (bool);

    /// @notice Processes revocation of multiple attestation and verifies they can be revoked.
    /// @param attestations The existing attestations to be revoked.
    /// @param values Explicit ETH amounts which were sent with each revocation.
    /// @return Whether the attestations can be revoked.
    function multiRevoke(
        Attestation[] calldata attestations,
        uint256[] calldata values
    ) external payable returns (bool);
}

contract SapienceVaultFactory is ISchemaResolver, ReentrancyGuard {
    // Core factory state
    IERC20 public immutable token;
    
    // Registry of deployed vaults: owner => vault contract address
    mapping(address => address) public userVaults;
    
    // Registry of all deployed vaults
    address[] public allVaults;
    
    // Market routing: marketAddress => vault contract address
    mapping(address => address) public marketToVault;
    
    // Events
    event VaultCreated(address indexed owner, address indexed vaultAddress);
    event MarketMapped(address indexed marketAddress, address indexed vaultAddress);
    
    constructor(address _token) {
        require(_token != address(0), "Invalid token");
        token = IERC20(_token);
    }
    
    /// @notice Create a new vault for a user
    function createVault() external nonReentrant returns (address vaultAddress) {
        require(userVaults[msg.sender] == address(0), "Vault already exists");
        
        // Deploy new vault contract
        SapienceVault vault = new SapienceVault(address(token), address(this), msg.sender);
        vaultAddress = address(vault);
        
        // Register the vault
        userVaults[msg.sender] = vaultAddress;
        allVaults.push(vaultAddress);
        
        emit VaultCreated(msg.sender, vaultAddress);
        
        return vaultAddress;
    }
    
    /// @notice Get or create a vault for a user
    function getOrCreateVault(address user) external nonReentrant returns (address vaultAddress) {
        vaultAddress = userVaults[user];
        
        if (vaultAddress == address(0)) {
            // Create new vault for the user
            SapienceVault vault = new SapienceVault(address(token), address(this), user);
            vaultAddress = address(vault);
            
            // Register the vault
            userVaults[user] = vaultAddress;
            allVaults.push(vaultAddress);
            
            emit VaultCreated(user, vaultAddress);
        }
        
        return vaultAddress;
    }
    

    
    /// @notice Process attestation with prediction data and route to correct vault
    function attest(Attestation calldata attestation) external payable override nonReentrant returns (bool) {
        try this.decodePredictionData(attestation.data) returns (PredictionData memory predictionData) {
            // Use the attester as the vault owner for this prediction
            address vaultOwner = attestation.attester;
            
            // Get or create vault for the attester
            address vaultAddress = this.getOrCreateVault(vaultOwner);
            
            // Automatically map this market to the attester's vault
            marketToVault[predictionData.marketAddress] = vaultAddress;
            emit MarketMapped(predictionData.marketAddress, vaultAddress);
            
            // Route prediction to the vault
            SapienceVault vault = SapienceVault(vaultAddress);
            vault.executePredictionRebalance(predictionData);
        } catch {
            // Ignore non-prediction attestations or failed routing
        }
        return true;
    }
    
    /// @notice Process multiple attestations
    function multiAttest(
        Attestation[] calldata attestations,
        uint256[] calldata values
    ) external payable override nonReentrant returns (bool) {
        for (uint i = 0; i < attestations.length; i++) {
            this.attest{value: values[i]}(attestations[i]);
        }
        return true;
    }
    
    /// @notice Process attestation revocation and close relevant position
    function revoke(Attestation calldata attestation) external payable override nonReentrant returns (bool) {
        try this.decodePredictionData(attestation.data) returns (PredictionData memory predictionData) {
            // First try to use existing mapping
            address vaultAddress = marketToVault[predictionData.marketAddress];
            
            // If no mapping exists, determine vault from attester
            if (vaultAddress == address(0)) {
                address vaultOwner = attestation.attester;
                vaultAddress = userVaults[vaultOwner];
            }
            
            if (vaultAddress != address(0)) {
                // Close the position in the vault
                SapienceVault vault = SapienceVault(vaultAddress);
                vault.closePositionByFactory(predictionData.marketId);
            }
        } catch {
            // Ignore non-prediction attestations or failed routing
        }
        return true;
    }
    
    /// @notice Process multiple attestation revocations
    function multiRevoke(
        Attestation[] calldata attestations,
        uint256[] calldata values
    ) external payable override nonReentrant returns (bool) {
        for (uint i = 0; i < attestations.length; i++) {
            this.revoke{value: values[i]}(attestations[i]);
        }
        return true;
    }
    
    /// @notice Checks if the resolver can be sent ETH
    function isPayable() external pure override returns (bool) {
        return true;
    }
    
    /// @notice Returns the version of the contract
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
    
    /// @notice Decode prediction data from attestation
    function decodePredictionData(bytes calldata data) external pure returns (PredictionData memory) {
        return abi.decode(data, (PredictionData));
    }
    
    /// @notice Get vault address for a user
    function getUserVault(address user) external view returns (address) {
        return userVaults[user];
    }
    
    /// @notice Get vault address mapped to a market
    function getMarketVault(address marketAddress) external view returns (address) {
        return marketToVault[marketAddress];
    }
    
    /// @notice Get total number of deployed vaults
    function getTotalVaults() external view returns (uint256) {
        return allVaults.length;
    }
    
    /// @notice Get all deployed vault addresses
    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }
    
    /// @notice Get vault at specific index
    function getVaultAt(uint256 index) external view returns (address) {
        require(index < allVaults.length, "Index out of bounds");
        return allVaults[index];
    }
    
    /// @notice Check if a user has a vault
    function hasVault(address user) external view returns (bool) {
        return userVaults[user] != address(0);
    }
    
    /// @notice Get aggregate data across all vaults
    function getAggregateData() external view returns (
        uint256 totalVaults,
        uint256 totalValueLocked,
        uint256 totalActivePositions
    ) {
        totalVaults = allVaults.length;
        totalValueLocked = 0;
        totalActivePositions = 0;
        
        for (uint256 i = 0; i < allVaults.length; i++) {
            SapienceVault vault = SapienceVault(allVaults[i]);
            try vault.getTotalValue() returns (uint256 vaultValue) {
                totalValueLocked += vaultValue;
            } catch {
                // Skip vaults that can't be queried
                continue;
            }
            
            try vault.getVaultActivePositions() returns (uint256[] memory positions) {
                totalActivePositions += positions.length;
            } catch {
                // Skip vaults that can't be queried
                continue;
            }
        }
        
        return (totalVaults, totalValueLocked, totalActivePositions);
    }
} 
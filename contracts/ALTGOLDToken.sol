/**




 $$$$$$\  $$\    $$$$$$$$\        $$$$$$\   $$$$$$\  $$\       $$$$$$$\  
$$  __$$\ $$ |   \__$$  __|      $$  __$$\ $$  __$$\ $$ |      $$  __$$\ 
$$ /  $$ |$$ |      $$ |         $$ /  \__|$$ /  $$ |$$ |      $$ |  $$ |
$$$$$$$$ |$$ |      $$ |         $$ |$$$$\ $$ |  $$ |$$ |      $$ |  $$ |
$$  __$$ |$$ |      $$ |         $$ |\_$$ |$$ |  $$ |$$ |      $$ |  $$ |
$$ |  $$ |$$ |      $$ |         $$ |  $$ |$$ |  $$ |$$ |      $$ |  $$ |
$$ |  $$ |$$$$$$$$\ $$ |         \$$$$$$  | $$$$$$  |$$$$$$$$\ $$$$$$$  |
\__|  \__|\________|\__|          \______/  \______/ \________|\_______/ 
                                                                         
                                                                    


*/



// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title ALTGOLDToken
 * @notice Gold-backed ERC20 token with 6 decimals
 * @dev Enhanced with gold reserve tracking and multi-tier minting controls
 */
contract ALTGOLDToken is 
    Initializable,
    ERC20Upgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    // ============ Role Definitions ============
    bytes32 public constant SUPPLY_CONTROLLER_ROLE = keccak256("SUPPLY_CONTROLLER_ROLE");
    bytes32 public constant WHITELIST_MANAGER_ROLE = keccak256("WHITELIST_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant COMPLIANCE_OFFICER_ROLE = keccak256("COMPLIANCE_OFFICER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant RESERVE_MANAGER_ROLE = keccak256("RESERVE_MANAGER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // ============ Constants ============
    uint256 public constant DECIMALS = 6;
    uint256 public constant TIMELOCK_DURATION = 24 hours;
    uint256 public constant EMERGENCY_TIMELOCK = 6 hours;
    uint256 public constant MAX_BATCH_SIZE = 100;
    string public constant VERSION = "1.0.0";

    // ============ Structs ============
    
    struct WhitelistData {
        bool isWhitelisted;
        uint128 addedAt;
        uint128 removedAt;
        address addedBy;
        string kycReferenceId;
    }

    struct GoldReserve {
        uint256 totalGrams;           // Total gold in grams (with 6 decimals)
        uint256 verifiedAt;           // Timestamp of last verification
        address verifiedBy;           // Auditor who verified
        string auditReference;        // IPFS hash or audit reference
        uint256 tokenPerGram;         // Tokens per gram of gold (direct ratio with 6 decimals)
    }

    struct MintingLimits {
        uint256 perTransactionLimit;  // Max tokens per mint transaction
        uint256 dailyLimit;           // Max tokens per 24 hours
        uint256 weeklyLimit;          // Max tokens per 7 days
        uint256 largeMintThreshold;   // Amount that triggers timelock
        uint256 mintCooldown;         // Minimum time between mints (seconds)
        uint256 maxDailyMints;        // Max number of mint operations per day
    }

    struct MintingStats {
        uint256 dailyMinted;          // Tokens minted in current day
        uint256 weeklyMinted;         // Tokens minted in current week
        uint256 lastMintTime;         // Timestamp of last mint
        uint256 lastDayReset;         // Last daily reset timestamp
        uint256 lastWeekReset;        // Last weekly reset timestamp
        uint256 dailyMintCount;       // Number of mints today
    }

    struct MintRequest {
        uint256 id;
        address to;
        uint256 amount;
        string reason;
        address requestedBy;
        uint256 requestTime;
        uint256 executeAfter;
        bool executed;
        bool cancelled;
        bytes32 dataHash;
    }

    // ============ State Variables ============
    
    mapping(address => WhitelistData) private _whitelistData;
    address[] private _whitelistedAddresses;
    mapping(address => uint256) private _addressIndex;
    uint256 private _totalWhitelisted;

    GoldReserve public goldReserve;
    uint256 public lastReserveUpdate;
    uint256 public reserveUpdateFrequency;

    MintingLimits public mintingLimits;
    MintingStats public mintingStats;
    
    mapping(uint256 => MintRequest) public mintRequests;
    uint256 public nextRequestId;
    uint256 public pendingMints;
    
    bool public circuitBreakerActive;
    uint256 public circuitBreakerTriggeredAt;
    uint256 public anomalyCounter;
    uint256 public lastAnomalyReset;

    bool public complianceMode;
    uint256 public maxTransferAmount;
    uint256 public minHoldingAmount;
    uint256 public lastComplianceCheck;
    
    uint256 public totalMinted;
    uint256 public totalBurned;
    uint256 public transferCount;
    uint256 public successfulMints;
    uint256 public cancelledMints;

    mapping(address => bool) public authorizedBurners;

    uint256[50] private __gap;

    // ============ Events ============
    
    event EmergencyPause(bool isPaused, address indexed triggeredBy, uint256 timestamp, string reason);
    event GoldReserveUpdated(uint256 totalGrams, uint256 tokenPerGram, uint256 maxMintable, address indexed auditor, string auditReference, uint256 timestamp);
    event MintRequestCreated(uint256 indexed requestId, address indexed to, uint256 amount, address indexed requestedBy, uint256 executeAfter, string reason);
    event MintRequestExecuted(uint256 indexed requestId, address indexed to, uint256 amount, address indexed executedBy, uint256 timestamp);
    event MintRequestCancelled(uint256 indexed requestId, address indexed cancelledBy, string reason, uint256 timestamp);
    event MintLimitsUpdated(uint256 perTransaction, uint256 daily, uint256 weekly, uint256 threshold, address indexed updatedBy, uint256 timestamp);
    event CircuitBreakerTriggered(string reason, uint256 timestamp, address indexed triggeredBy, uint256 duration);
    event CircuitBreakerReset(address indexed resetBy, uint256 timestamp);
    event SupplyIncreased(address indexed minter, address indexed recipient, uint256 amount, uint256 newTotalSupply, uint256 timestamp, string reason);
    event SupplyDecreased(address indexed burner, address indexed from, uint256 amount, uint256 newTotalSupply, uint256 timestamp, string reason);
    event WhitelistUpdated(address indexed account, bool status, address indexed updatedBy, uint256 timestamp, string kycReferenceId);
    event ComplianceTransfer(address indexed from, address indexed to, uint256 amount, uint256 timestamp, bytes32 transactionHash);
    event ComplianceSettingsUpdated(bool complianceMode, uint256 maxTransferAmount, uint256 minHoldingAmount, address indexed updatedBy);
    event AuthorizedBurnerUpdated(address indexed burner, bool status, address indexed updatedBy);

   
     // ============ constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============ Modifiers ============
    
    modifier onlyWhitelisted(address account) {
        require(_whitelistData[account].isWhitelisted, "ALTGOLD: Address not whitelisted");
        _;
    }

    modifier bothWhitelisted(address from, address to) {
        if (from != address(0)) {
            require(_whitelistData[from].isWhitelisted || authorizedBurners[from], "ALTGOLD: Sender not whitelisted");
        }
        if (to != address(0)) {
            require(_whitelistData[to].isWhitelisted || authorizedBurners[to], "ALTGOLD: Recipient not whitelisted");
        }
        _;
    }

    modifier circuitBreakerCheck() {
        require(!circuitBreakerActive, "ALTGOLD: Circuit breaker is active");
        _;
    }

    modifier reserveCheck(uint256 amount) {
        require(goldReserve.totalGrams > 0, "ALTGOLD: No gold reserves set");
        uint256 maxMintable = getMaxMintableTokens();
        require(amount <= maxMintable, "ALTGOLD: Exceeds gold backing");
        _;
    }

    modifier complianceCheck(address from, address to, uint256 amount) {
        if (complianceMode && from != address(0) && to != address(0)) {
            require(amount <= maxTransferAmount || maxTransferAmount == 0, "ALTGOLD: Transfer exceeds maximum allowed");
            
            uint256 recipientBalance = balanceOf(to) + amount;
            require(recipientBalance >= minHoldingAmount || recipientBalance == 0, "ALTGOLD: Below minimum holding requirement");
        }
        _;
    }

    // ============ Initialization ============
    
    function initialize(
        address admin,
        string memory name_,
        string memory symbol_
    ) public initializer {
        require(admin != address(0), "ALTGOLD: Admin cannot be zero address");
        
        __ERC20_init(name_, symbol_);
        __ERC20Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        // Grant all roles to admin initially
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SUPPLY_CONTROLLER_ROLE, admin);
        _grantRole(WHITELIST_MANAGER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(COMPLIANCE_OFFICER_ROLE, admin);
        _grantRole(AUDITOR_ROLE, admin);
        _grantRole(RESERVE_MANAGER_ROLE, admin);
        _grantRole(EXECUTOR_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);

        // Initialize default minting limits (with 6 decimals)
        mintingLimits = MintingLimits({
            perTransactionLimit: 100_000 * 10**DECIMALS,   // 100k tokens
            dailyLimit: 1_000_000 * 10**DECIMALS,          // 1M tokens
            weeklyLimit: 5_000_000 * 10**DECIMALS,         // 5M tokens
            largeMintThreshold: 50_000 * 10**DECIMALS,     // 50k triggers timelock
            mintCooldown: 1 hours,
            maxDailyMints: 10
        });

        complianceMode = true;
        maxTransferAmount = 0;
        minHoldingAmount = 0;
        reserveUpdateFrequency = 30 days;
        
        _addToWhitelist(admin, "GENESIS_ADMIN");
    }

    // ============ Gold Reserve Management ============
    /**
     * @notice Updates the gold reserve backing the tokens
     * @dev Only AUDITOR_ROLE can update after verification
     * @param totalGrams Total gold in grams (with 6 decimal places)
     * @param tokenPerGram How many tokens per gram of gold (with 6 decimals)
     * @param auditReference Reference to audit report (IPFS hash or ID)
     */
    function updateGoldReserve(
        uint256 totalGrams,
        uint256 tokenPerGram,
        string memory auditReference
    ) external onlyRole(AUDITOR_ROLE) {
        require(totalGrams > 0, "ALTGOLD: Invalid reserve amount");
        require(tokenPerGram > 0, "ALTGOLD: Invalid token ratio");
        require(bytes(auditReference).length > 0, "ALTGOLD: Audit reference required");

        goldReserve = GoldReserve({
            totalGrams: totalGrams,
            verifiedAt: block.timestamp,
            verifiedBy: msg.sender,
            auditReference: auditReference,
            tokenPerGram: tokenPerGram
        });

        lastReserveUpdate = block.timestamp;
        uint256 maxMintable = getMaxMintableTokens();
        
        emit GoldReserveUpdated(totalGrams, tokenPerGram, maxMintable, msg.sender, auditReference, block.timestamp);
    }

    /**
     * @notice Gets the maximum tokens that can be minted based on gold reserves
     * @return Maximum mintable tokens
     */
    function getMaxMintableTokens() public view returns (uint256) {
        if (goldReserve.totalGrams == 0 || goldReserve.tokenPerGram == 0) {
            return 0;
        }
        
        uint256 totalBackedTokens = (goldReserve.totalGrams * goldReserve.tokenPerGram) / 10**DECIMALS;
        uint256 currentSupply = totalSupply();
        
        if (totalBackedTokens <= currentSupply) {
            return 0;
        }
        
        return totalBackedTokens - currentSupply;
    }

    // ============ Minting Controls ============
    
    function updateMintingLimits(
        uint256 perTransactionLimit,
        uint256 dailyLimit,
        uint256 weeklyLimit,
        uint256 largeMintThreshold,
        uint256 mintCooldown,
        uint256 maxDailyMints
    ) external onlyRole(RESERVE_MANAGER_ROLE) {
        require(perTransactionLimit > 0, "ALTGOLD: Invalid per-tx limit");
        require(dailyLimit >= perTransactionLimit, "ALTGOLD: Daily < per-tx");
        require(weeklyLimit >= dailyLimit, "ALTGOLD: Weekly < daily");
        
        mintingLimits = MintingLimits({
            perTransactionLimit: perTransactionLimit,
            dailyLimit: dailyLimit,
            weeklyLimit: weeklyLimit,
            largeMintThreshold: largeMintThreshold,
            mintCooldown: mintCooldown,
            maxDailyMints: maxDailyMints
        });
        
        emit MintLimitsUpdated(perTransactionLimit, dailyLimit, weeklyLimit, largeMintThreshold, msg.sender, block.timestamp);
    }

    function _resetMintingStats() private {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 currentWeek = block.timestamp / 1 weeks;
        
        if (currentDay > mintingStats.lastDayReset / 1 days) {
            mintingStats.dailyMinted = 0;
            mintingStats.dailyMintCount = 0;
            mintingStats.lastDayReset = block.timestamp;
        }
        
        if (currentWeek > mintingStats.lastWeekReset / 1 weeks) {
            mintingStats.weeklyMinted = 0;
            mintingStats.lastWeekReset = block.timestamp;
        }
    }

    function _validateMintingLimits(uint256 amount) private view {
        require(amount <= mintingLimits.perTransactionLimit, "ALTGOLD: Exceeds per-transaction limit");
        require(mintingStats.dailyMinted + amount <= mintingLimits.dailyLimit, "ALTGOLD: Exceeds daily limit");
        require(mintingStats.weeklyMinted + amount <= mintingLimits.weeklyLimit, "ALTGOLD: Exceeds weekly limit");
        require(block.timestamp >= mintingStats.lastMintTime + mintingLimits.mintCooldown, "ALTGOLD: Mint cooldown active");
        require(mintingStats.dailyMintCount < mintingLimits.maxDailyMints, "ALTGOLD: Max daily mint count reached");
    }

    // ============ Minting Functions ============
    
    function mint(address to, uint256 amount, string memory reason)
        external
        nonReentrant
        onlyRole(SUPPLY_CONTROLLER_ROLE)
        onlyWhitelisted(to)
        circuitBreakerCheck
        reserveCheck(amount)
    {
        require(to != address(0), "ALTGOLD: Cannot mint to zero address");
        require(amount > 0, "ALTGOLD: Amount must be greater than zero");
        require(bytes(reason).length > 0, "ALTGOLD: Reason required");
        
        _resetMintingStats();
        
        if (amount >= mintingLimits.largeMintThreshold) {
            _createMintRequest(to, amount, reason);
        } else {
            _validateMintingLimits(amount);
            _executeMint(to, amount, reason);
        }
    }

    /**
     * @notice Creates a timelock mint request for large amounts
     */
    function _createMintRequest(address to, uint256 amount, string memory reason) private {
        uint256 requestId = nextRequestId++;
        uint256 executeAfter = block.timestamp + TIMELOCK_DURATION;
        
        mintRequests[requestId] = MintRequest({
            id: requestId,
            to: to,
            amount: amount,
            reason: reason,
            requestedBy: msg.sender,
            requestTime: block.timestamp,
            executeAfter: executeAfter,
            executed: false,
            cancelled: false,
            dataHash: keccak256(abi.encodePacked(to, amount, reason))
        });
        
        pendingMints += amount;
        
        emit MintRequestCreated(requestId, to, amount, msg.sender, executeAfter, reason);
    }
    /**
     * @notice Executes a timelocked mint request
     * @param requestId ID of the mint request
     */
    function executeMintRequest(uint256 requestId)
        external
        nonReentrant
        onlyRole(EXECUTOR_ROLE)
        circuitBreakerCheck
    {
        MintRequest storage request = mintRequests[requestId];
        
        require(!request.executed, "ALTGOLD: Already executed");
        require(!request.cancelled, "ALTGOLD: Request cancelled");
        require(block.timestamp >= request.executeAfter, "ALTGOLD: Timelock not expired");
        require(request.amount > 0, "ALTGOLD: Invalid request");
        require(_whitelistData[request.to].isWhitelisted, "ALTGOLD: Recipient no longer whitelisted");
        require(request.amount <= getMaxMintableTokens(), "ALTGOLD: Exceeds current gold backing");
        
        request.executed = true;
        pendingMints -= request.amount;
        
        _mint(request.to, request.amount);
        totalMinted += request.amount;
        successfulMints++;
        
        emit MintRequestExecuted(requestId, request.to, request.amount, msg.sender, block.timestamp);
        emit SupplyIncreased(request.requestedBy, request.to, request.amount, totalSupply(), block.timestamp, request.reason);
    }

    function cancelMintRequest(uint256 requestId, string memory reason)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        MintRequest storage request = mintRequests[requestId];
        
        require(!request.executed, "ALTGOLD: Already executed");
        require(!request.cancelled, "ALTGOLD: Already cancelled");
        require(request.amount > 0, "ALTGOLD: Invalid request");
        
        request.cancelled = true;
        pendingMints -= request.amount;
        cancelledMints++;
        
        emit MintRequestCancelled(requestId, msg.sender, reason, block.timestamp);
    }
    /**
     * @notice Internal function to execute immediate mint
     */
    function _executeMint(address to, uint256 amount, string memory reason) private {
        _mint(to, amount);
        
        totalMinted += amount;
        mintingStats.dailyMinted += amount;
        mintingStats.weeklyMinted += amount;
        mintingStats.lastMintTime = block.timestamp;
        mintingStats.dailyMintCount++;
        successfulMints++;
        
        emit SupplyIncreased(msg.sender, to, amount, totalSupply(), block.timestamp, reason);
        
        _checkForAnomalies(amount);
    }

    function burn(address from, uint256 amount, string memory reason)
        external
        nonReentrant
    {
        require(
            hasRole(SUPPLY_CONTROLLER_ROLE, msg.sender) || 
            hasRole(BURNER_ROLE, msg.sender) || 
            authorizedBurners[msg.sender],
            "ALTGOLD: Unauthorized burner"
        );
        require(from != address(0), "ALTGOLD: Cannot burn from zero address");
        require(amount > 0, "ALTGOLD: Amount must be greater than zero");
        require(balanceOf(from) >= amount, "ALTGOLD: Insufficient balance");
        
        _burn(from, amount);
        totalBurned += amount;
        
        emit SupplyDecreased(msg.sender, from, amount, totalSupply(), block.timestamp, reason);
    }

    function setAuthorizedBurner(address burner, bool authorized)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(burner != address(0), "ALTGOLD: Invalid burner address");
        authorizedBurners[burner] = authorized;
        emit AuthorizedBurnerUpdated(burner, authorized, msg.sender);
    }

    // ============ Circuit Breaker ============
    
    function _checkForAnomalies(uint256 amount) private {
        if (totalSupply() > 0 && amount > (totalSupply() * 10) / 100) {
            _triggerCircuitBreaker("Large mint detected: >10% of supply");
            return;
        }
        
        uint256 currentHour = block.timestamp / 1 hours;
        if (currentHour == lastAnomalyReset / 1 hours) {
            anomalyCounter++;
            if (anomalyCounter > 5) {
                _triggerCircuitBreaker("Rapid minting pattern detected");
            }
        } else {
            anomalyCounter = 1;
            lastAnomalyReset = block.timestamp;
        }
        
        if (block.timestamp > lastReserveUpdate + reserveUpdateFrequency) {
            _triggerCircuitBreaker("Gold reserves not updated recently");
        }
    }

    function _triggerCircuitBreaker(string memory reason) private {
        circuitBreakerActive = true;
        circuitBreakerTriggeredAt = block.timestamp;
        
        emit CircuitBreakerTriggered(reason, block.timestamp, msg.sender, EMERGENCY_TIMELOCK);
    }

    function resetCircuitBreaker() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(circuitBreakerActive, "ALTGOLD: Circuit breaker not active");
        require(block.timestamp >= circuitBreakerTriggeredAt + EMERGENCY_TIMELOCK, "ALTGOLD: Emergency timelock not expired");
        
        circuitBreakerActive = false;
        anomalyCounter = 0;
        
        emit CircuitBreakerReset(msg.sender, block.timestamp);
    }

    // ============ Whitelist Management ============
    
    function addToWhitelist(address account, string memory kycReferenceId)
        external
        onlyRole(WHITELIST_MANAGER_ROLE)
    {
        require(account != address(0), "ALTGOLD: Cannot whitelist zero address");
        require(!_whitelistData[account].isWhitelisted, "ALTGOLD: Already whitelisted");
        
        _addToWhitelist(account, kycReferenceId);
        
        emit WhitelistUpdated(account, true, msg.sender, block.timestamp, kycReferenceId);
    }

    function removeFromWhitelist(address account)
        external
        onlyRole(WHITELIST_MANAGER_ROLE)
    {
        require(_whitelistData[account].isWhitelisted, "ALTGOLD: Not whitelisted");
        
        _removeFromWhitelist(account);
        
        emit WhitelistUpdated(account, false, msg.sender, block.timestamp, "");
    }

    function batchUpdateWhitelist(
        address[] calldata accounts,
        bool[] calldata statuses,
        string[] calldata kycReferenceIds
    ) external onlyRole(WHITELIST_MANAGER_ROLE) {
        require(accounts.length == statuses.length && accounts.length == kycReferenceIds.length, "ALTGOLD: Array length mismatch");
        require(accounts.length <= MAX_BATCH_SIZE, "ALTGOLD: Batch size too large");

        for (uint256 i = 0; i < accounts.length; i++) {
            if (statuses[i] && !_whitelistData[accounts[i]].isWhitelisted) {
                _addToWhitelist(accounts[i], kycReferenceIds[i]);
                emit WhitelistUpdated(accounts[i], true, msg.sender, block.timestamp, kycReferenceIds[i]);
            } else if (!statuses[i] && _whitelistData[accounts[i]].isWhitelisted) {
                _removeFromWhitelist(accounts[i]);
                emit WhitelistUpdated(accounts[i], false, msg.sender, block.timestamp, "");
            }
        }
    }

    function _addToWhitelist(address account, string memory kycReferenceId) private {
        WhitelistData storage data = _whitelistData[account];
        
        data.isWhitelisted = true;
        data.addedAt = uint128(block.timestamp);
        data.removedAt = 0;
        data.addedBy = msg.sender;
        data.kycReferenceId = kycReferenceId;
        
        _whitelistedAddresses.push(account);
        _addressIndex[account] = _whitelistedAddresses.length - 1;
        _totalWhitelisted++;
    }

    function _removeFromWhitelist(address account) private {
        WhitelistData storage data = _whitelistData[account];
        
        data.isWhitelisted = false;
        data.removedAt = uint128(block.timestamp);
        
        uint256 index = _addressIndex[account];
        uint256 lastIndex = _whitelistedAddresses.length - 1;
        
        if (index != lastIndex) {
            address lastAddress = _whitelistedAddresses[lastIndex];
            _whitelistedAddresses[index] = lastAddress;
            _addressIndex[lastAddress] = index;
        }
        
        _whitelistedAddresses.pop();
        delete _addressIndex[account];
        _totalWhitelisted--;
    }

    // ============ View Functions ============
    
    function isWhitelisted(address account) external view returns (bool) {
        return _whitelistData[account].isWhitelisted || authorizedBurners[account];
    }

    function getWhitelistData(address account) external view returns (WhitelistData memory) {
        return _whitelistData[account];
    }

    function getWhitelistedAddresses() external view returns (address[] memory) {
        return _whitelistedAddresses;
    }

    function getTotalWhitelisted() external view returns (uint256) {
        return _totalWhitelisted;
    }

    function getMintRequest(uint256 requestId) external view returns (MintRequest memory) {
        return mintRequests[requestId];
    }

    function getCurrentMintingStats() external view returns (
        uint256 dailyMinted,
        uint256 weeklyMinted,
        uint256 dailyMintCount,
        uint256 lastMintTime
    ) {
        return (
            mintingStats.dailyMinted,
            mintingStats.weeklyMinted,
            mintingStats.dailyMintCount,
            mintingStats.lastMintTime
        );
    }

    function getGoldBackingInfo() external view returns (
        uint256 totalGrams,
        uint256 tokenPerGram,
        uint256 maxMintable,
        uint256 lastUpdate,
        address lastAuditor
    ) {
        return (
            goldReserve.totalGrams,
            goldReserve.tokenPerGram,
            getMaxMintableTokens(),
            goldReserve.verifiedAt,
            goldReserve.verifiedBy
        );
    }

    function getStatistics() external view returns (
        uint256 totalSupply_,
        uint256 totalMinted_,
        uint256 totalBurned_,
        uint256 totalWhitelisted_,
        uint256 transferCount_,
        bool isPaused_
    ) {
        return (
            totalSupply(),
            totalMinted,
            totalBurned,
            _totalWhitelisted,
            transferCount,
            paused()
        );
    }

    // ============ Pause Functions ============
    
    function pause(string memory reason) external onlyRole(PAUSER_ROLE) {
        _pause();
        emit EmergencyPause(true, msg.sender, block.timestamp, reason);
    }

    function unpause(string memory reason) external onlyRole(PAUSER_ROLE) {
        _unpause();
        emit EmergencyPause(false, msg.sender, block.timestamp, reason);
    }

    // ============ Compliance Settings ============
    
     /**
     * @notice Updates compliance settings
     * @dev Only COMPLIANCE_OFFICER_ROLE can call
     * @param _complianceMode Enable/disable compliance checks
     * @param _maxTransferAmount Maximum transfer amount (0 for no limit)
     * @param _minHoldingAmount Minimum holding requirement (0 for no minimum)
     */
    function updateComplianceSettings(
        bool _complianceMode,
        uint256 _maxTransferAmount,
        uint256 _minHoldingAmount
    ) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        complianceMode = _complianceMode;
        maxTransferAmount = _maxTransferAmount;
        minHoldingAmount = _minHoldingAmount;
        lastComplianceCheck = block.timestamp;

        emit ComplianceSettingsUpdated(_complianceMode, _maxTransferAmount, _minHoldingAmount, msg.sender);
    }

    // ============ Transfer Overrides ============
    
    function transfer(address to, uint256 amount)
        public
        override
        bothWhitelisted(msg.sender, to)
        complianceCheck(msg.sender, to, amount)
        returns (bool)
    {
        bool result = super.transfer(to, amount);
        if (result) {
            transferCount++;
            emit ComplianceTransfer(msg.sender, to, amount, block.timestamp, keccak256(abi.encodePacked(msg.sender, to, amount, block.timestamp)));
        }
        return result;
    }

    function transferFrom(address from, address to, uint256 amount)
        public
        override
        bothWhitelisted(from, to)
        complianceCheck(from, to, amount)
        returns (bool)
    {
        bool result = super.transferFrom(from, to, amount);
        if (result) {
            transferCount++;
            emit ComplianceTransfer(from, to, amount, block.timestamp, keccak256(abi.encodePacked(from, to, amount, block.timestamp)));
        }
        return result;
    }

    function approve(address spender, uint256 amount) 
        public 
        override 
        bothWhitelisted(msg.sender, spender)
        returns (bool) 
    {
        return super.approve(spender, amount);
    }

    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._update(from, to, amount);
    }

    // ============ Upgrade Functions ============
    
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newImplementation != address(0), "ALTGOLD: Invalid implementation");
    }

    function version() public pure returns (string memory) {
        return VERSION;
    }

    function decimals() public pure override returns (uint8) {
        return uint8(DECIMALS);
    }
}
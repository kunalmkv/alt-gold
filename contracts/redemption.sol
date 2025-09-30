// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title ALTGOLDRedemption
 * @notice Instant redemption of ALTGOLD → USDC using *oracle-derived* USDC/gram cached on-chain.
 *
 * Pricing source:
 *   Anyone can call `updateUsdcPerGramFromOracle()` which:
 *     - Reads Chainlink XAU/USD (per troy ounce) and optional USDC/USD feeds,
 *     - Converts ounce → gram via 31.103476,
 *     - Computes USDC/gram in USDC smallest units (e.g., 1e6 for USDC-6),
 *     - Validates staleness, deviation, and sanity bounds,
 *     - Caches to `usdcPerGram` and updates `rateUpdatedAt`.
 *
 * If no USDC/USD feed is set, we assume USDC ≈ $1.00 (i.e., divide by 1.0).
 *
 * Rounding: All divisions *floor* (truncate) — conservative and deterministic.
 */

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// -------- Chainlink Aggregator (price feed) --------
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

interface IALTGOLDMinimal {
    function isWhitelisted(address account) external view returns (bool);
    function decimals() external view returns (uint8);
    function burn(address from, uint256 amount, string memory reason) external;
}

contract ALTGOLDRedemption is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // ========= Roles =========
    bytes32 public constant COMPLIANCE_ROLE   = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant RATE_MANAGER_ROLE = keccak256("RATE_MANAGER_ROLE");
    bytes32 public constant TREASURER_ROLE    = keccak256("TREASURER_ROLE");
    bytes32 public constant PAUSER_ROLE       = keccak256("PAUSER_ROLE");
    bytes32 public constant EMERGENCY_ROLE    = keccak256("EMERGENCY_ROLE");

    // ========= Constants & version =========
    uint256 public constant WEIGHT_PRECISION = 1e6;            // grams scaled by 1e6
    uint256 public constant OUNCE_TO_GRAM_Q6 = 31_103_476;     // 1 troy ounce = 31.103476 grams (×1e6)
    string  public constant VERSION = "1.0.0";

    // ========= External tokens =========
    IALTGOLDMinimal public altgold;
    IERC20Upgradeable public usdc;
    uint8 public altDecimals;   
    uint8 public usdcDecimals;   // typically 6

    // ========= Economics (weight-based) =========
    uint256 public goldWeightPerALT_g6; // grams per ALT (×1e6)
    uint256 public usdcPerGram;         // cached USDC smallest-units per gram
    uint256 public rateUpdatedAt;       // when `usdcPerGram` last updated (from oracle)
    uint256 public rateValidityPeriod;  // max age allowed at redeem (0 disables)

    // ========= Oracle config (Option 2: permissionless cache) =========
    AggregatorV3Interface public xauUsdFeed;   // REQUIRED: XAU/USD (per troy ounce)
    AggregatorV3Interface public usdcUsdFeed;  // OPTIONAL: USDC/USD (assume 1.0 if unset)
    bool public useUsdcUsdFeed;                // true if usdcUsdFeed set

    uint256 public oracleStalenessThreshold;   // e.g., 1 hours
    uint16  public maxUpdateDeviationBps;      // e.g., 1000 = 10%; 0 disables
    uint256 public minUsdcPerGram;             // sanity floor (0 disables)
    uint256 public maxUsdcPerGram;             // sanity cap (0 disables)

    // ========= Redemption settings =========
    uint256 public minRedemptionAmount;
    uint256 public maxRedemptionAmount;
    bool    public instantRedemptionEnabled;
    bool    public complianceCheckRequired;

    // ========= Limits & cooldowns =========
    uint256 public globalDailyLimitUSDC;
    uint256 public userDailyLimitUSDC;
    uint256 public cooldownSeconds;

    uint256 public currentDayStart;
    uint256 public globalDailyUsedUSDC;

    mapping(address => uint256) public userDayStart;
    mapping(address => uint256) public userDailyUsedUSDC;
    mapping(address => uint256) public lastRedemptionTime;

    // ========= Compliance =========
    mapping(address => uint256) public complianceNonce;

    // ========= Treasury =========
    uint256 public bufferUSDC;           // absolute buffer to keep after payout
    uint16  public reserveRequirementBps; // OPTIONAL: post-balance >= bps * payout (0 disables)

    // ========= Processing window =========
    struct ProcessingWindow { bool enabled; uint8 startHour; uint8 endHour; }
    ProcessingWindow public processingWindow;

    // ========= Redemption tracking =========
    struct RedemptionRecord {
        uint256 id;
        address user;
        uint256 amountALT;
        uint256 amountUSDC;
        uint256 timestamp;
        uint256 snapshotWeight_g6;
        uint256 snapshotUSDCPerGram;
        bytes32 traceId; // synthetic digest (not chain tx hash)
    }
    mapping(uint256 => RedemptionRecord) public redemptions;
    mapping(address => uint256[]) public userRedemptions;
    uint256 public nextRedemptionId;

    // ========= Blacklist =========
    mapping(address => bool) public blacklisted;

    // ========= Emergency =========
    struct EmergencyWithdrawal { bool scheduled; address recipient; uint256 amount; uint256 executeAfter; }
    EmergencyWithdrawal public emergencyPlan;
    uint256 public emergencyDelay;

    // ========= Stats =========
    uint256 public totalRedeemedALT;
    uint256 public totalPaidUSDC;
    uint256 public totalRedemptionCount;
    mapping(address => uint256) public userTotalRedeemed;
    mapping(address => uint256) public userRedemptionCount;

    // ========= Events =========
    event RedemptionRequested(
        uint256 indexed id,
        address indexed user,
        uint256 amountALT,
        uint256 quotedUSDC,
        uint256 timestamp,
        uint256 weight_g6,
        uint256 usdcPerGram
    );
    event RedemptionCompleted(
        uint256 indexed redemptionId,
        address indexed user,
        uint256 amountALT,
        uint256 amountUSDC,
        uint256 timestamp,
        bytes32 traceId
    );

    // Admin / policy events
    event RatesUpdated(uint256 oldWeight_g6, uint256 newWeight_g6, uint256 oldUSDCPerGram, uint256 newUSDCPerGram, address indexed by);
    event LimitsUpdated(uint256 minRedemption, uint256 maxRedemption, uint256 globalDailyLimit, uint256 userDailyLimit, uint256 cooldown, address indexed by);
    event BufferUpdated(uint256 oldBuffer, uint256 newBuffer, address indexed by);
    event ReserveRequirementUpdated(uint16 oldBps, uint16 newBps, address indexed by);
    event ProcessingWindowUpdated(bool enabled, uint8 startHour, uint8 endHour, address indexed by);
    event UserBlacklistUpdated(address indexed user, bool blacklisted, address indexed by);
    event EmergencyScheduled(address recipient, uint256 amount, uint256 executeAfter);
    event EmergencyExecuted(address recipient, uint256 amount);
    event EmergencyCancelled();
    event USDCWithdrawn(address indexed to, uint256 amount, address indexed by);
    event USDCDeposited(address indexed from, uint256 amount);
    event RedemptionSettingsUpdated(bool instantEnabled, bool complianceRequired, address indexed by);

    // Oracle events
    event OracleFeedsSet(address indexed xauUsd, address indexed usdcUsd, bool useUsdcUsd);
    event OracleConfigUpdated(uint256 staleness, uint16 maxDevBps, uint256 minUPG, uint256 maxUPG, address indexed by);
    event OraclePriceCached(
        uint256 oldUsdcPerGram,
        uint256 newUsdcPerGram,
        uint80 xauRoundId,
        uint80 usdcRoundId,
        uint256 xauUpdatedAt,
        uint256 usdcUpdatedAt,
        address indexed updater
    );

    // ========= Storage gap =========
    uint256[50] private __gap;

    // ========= Constructor (UUPS impl lock) =========
    constructor() {
        _disableInitializers();
    }

    // ========= Initialization =========
    function initialize(
        address admin,
        address altgoldToken,
        address usdcToken,
        uint256 initialGoldWeightPerALT_g6,
        // oracle wiring
        address xauUsdFeed_,
        address usdcUsdFeed_,      // pass 0 if unavailable on Sepolia
        uint256 stalenessThreshold,// e.g., 1 hours
        uint16  maxDevBps,         // e.g., 1000 = 10%; 0 disables
        uint256 minUPG,            // sanity floor (USDC units/gram); 0 disables
        uint256 maxUPG             // sanity cap  (USDC units/gram); 0 disables
    ) external initializer {
        require(admin != address(0), "admin=0");
        require(altgoldToken != address(0) && usdcToken != address(0), "token=0");
        require(initialGoldWeightPerALT_g6 > 0, "weight=0");

        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(RATE_MANAGER_ROLE, admin);
        _grantRole(TREASURER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(EMERGENCY_ROLE, admin);

        altgold = IALTGOLDMinimal(altgoldToken);
        usdc    = IERC20Upgradeable(usdcToken);
        altDecimals  = altgold.decimals();
        usdcDecimals = IERC20MetadataUpgradeable(usdcToken).decimals();

        // economics
        goldWeightPerALT_g6 = initialGoldWeightPerALT_g6;

        // oracle config
        oracleStalenessThreshold = stalenessThreshold;
        maxUpdateDeviationBps    = maxDevBps;
        minUsdcPerGram           = minUPG;
        maxUsdcPerGram           = maxUPG;
        _setOracleFeeds(xauUsdFeed_, usdcUsdFeed_);

        // redemption policy defaults (tune as needed)
        rateValidityPeriod      = 24 hours;        // max cache age accepted by redeem()
        instantRedemptionEnabled= true;
        complianceCheckRequired = false;

        // limits/cooldown defaults
        minRedemptionAmount     = 10 * (10 ** altDecimals);
        maxRedemptionAmount     = 10_000 * (10 ** altDecimals);
        globalDailyLimitUSDC    = 1_000_000 * (10 ** usdcDecimals);
        userDailyLimitUSDC      =   50_000 * (10 ** usdcDecimals);
        cooldownSeconds         = 1 hours;

        // treasury defaults
        bufferUSDC              = 100_000 * (10 ** usdcDecimals);
        reserveRequirementBps   = 0; // disabled by default

        // window / emergency
        processingWindow        = ProcessingWindow(false, 0, 24);
        emergencyDelay          = 24 hours;

        currentDayStart = _startOfTodayUTC();
        nextRedemptionId = 1;
    }

    // ========= Oracle (admin config) =========

    function setOracleFeeds(address xauUsdFeed_, address usdcUsdFeed_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setOracleFeeds(xauUsdFeed_, usdcUsdFeed_);
    }

    function _setOracleFeeds(address xauUsdFeed_, address usdcUsdFeed_) internal {
        require(xauUsdFeed_ != address(0), "xauFeed=0");
        xauUsdFeed = AggregatorV3Interface(xauUsdFeed_);
        usdcUsdFeed = AggregatorV3Interface(usdcUsdFeed_);
        useUsdcUsdFeed = (usdcUsdFeed_ != address(0));
        emit OracleFeedsSet(xauUsdFeed_, usdcUsdFeed_, useUsdcUsdFeed);
    }

    function setOracleConfig(
        uint256 staleness,
        uint16  maxDevBps,
        uint256 minUPG,
        uint256 maxUPG
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(maxDevBps <= 10_000, "dev>100%");
        oracleStalenessThreshold = staleness;
        maxUpdateDeviationBps    = maxDevBps;
        minUsdcPerGram           = minUPG;
        maxUsdcPerGram           = maxUPG;
        emit OracleConfigUpdated(staleness, maxDevBps, minUPG, maxUPG, msg.sender);
    }

    /// @notice Pure view of what the oracle-derived USDC/gram would be *right now*.
    function previewOracleUsdcPerGram() external view returns (uint256 usdcPerGram_) {
        (usdcPerGram_,,,,) = _computeUsdcPerGramFromFeeds();
    }

    /// @notice Permissionless cache update from oracles (XAU/USD and optional USDC/USD).
    function updateUsdcPerGramFromOracle() external {
        (uint256 newUPG, uint80 xauRound, uint80 usdcRound, uint256 xauUpd, uint256 usdcUpd) =
            _computeUsdcPerGramFromFeeds();

        // deviation guard
        if (maxUpdateDeviationBps > 0 && usdcPerGram != 0) {
            uint256 old = usdcPerGram;
            uint256 diff = old > newUPG ? (old - newUPG) : (newUPG - old);
            require(diff * 10_000 <= uint256(maxUpdateDeviationBps) * old, "oracle: deviation");
        }

        // sanity bounds
        if (minUsdcPerGram > 0) require(newUPG >= minUsdcPerGram, "oracle: below min");
        if (maxUsdcPerGram > 0) require(newUPG <= maxUsdcPerGram, "oracle: above max");

        uint256 oldUPG = usdcPerGram;
        usdcPerGram = newUPG;
        rateUpdatedAt = block.timestamp;

        emit OraclePriceCached(oldUPG, newUPG, xauRound, usdcRound, xauUpd, usdcUpd, msg.sender);
    }

    /// @dev Core computation from feeds — returns (USDC/gram, xauRoundId, usdcRoundId, xauUpdatedAt, usdcUpdatedAt)
    function _computeUsdcPerGramFromFeeds()
        internal
        view
        returns (uint256 upg, uint80 xauRoundId, uint80 usdcRoundId, uint256 xauUpdatedAt, uint256 usdcUpdatedAt)
    {
        require(address(xauUsdFeed) != address(0), "oracle: xau unset");

        // Read XAU/USD (per troy ounce)
        {
            int256 xauAnswer;
            uint256 startedAt; uint80 answeredInRound;
            (xauRoundId, xauAnswer, startedAt, xauUpdatedAt, answeredInRound) = xauUsdFeed.latestRoundData();
            require(xauAnswer > 0, "oracle: xau bad");
            require(xauUpdatedAt != 0 && answeredInRound >= xauRoundId, "oracle: xau stale round");
            if (oracleStalenessThreshold > 0) {
                require(block.timestamp - xauUpdatedAt <= oracleStalenessThreshold, "oracle: xau stale");
            }
            // decimals for XAU feed
            uint8 xauDec = AggregatorV3Interface(xauUsdFeed).decimals();

            // Compute USD/gram in units of 1e(xauDec)
            // usdPerGram_1 = (xauAnswer * 1e6) / 31_103_476
            uint256 usdPerGram_1 = (uint256(xauAnswer) * WEIGHT_PRECISION) / OUNCE_TO_GRAM_Q6;

            if (useUsdcUsdFeed) {
                // Read USDC/USD
                int256 usdcAnswer;
                uint256 usdcStartedAt; uint80 usdcAnsweredInRound;
                (usdcRoundId, usdcAnswer, usdcStartedAt, usdcUpdatedAt, usdcAnsweredInRound) = usdcUsdFeed.latestRoundData();
                require(usdcAnswer > 0, "oracle: usdc bad");
                require(usdcUpdatedAt != 0 && usdcAnsweredInRound >= usdcRoundId, "oracle: usdc stale round");
                if (oracleStalenessThreshold > 0) {
                    require(block.timestamp - usdcUpdatedAt <= oracleStalenessThreshold, "oracle: usdc stale");
                }
                uint8 usdcUsdDec = AggregatorV3Interface(usdcUsdFeed).decimals();

                // usdcPerGram =
                //   usdPerGram(1e xauDec) * (10^usdcDecimals) * (10^usdcUsdDec)
                //   ------------------------------------------------------------
                //           (10^xauDec) * usdcUsdAnswer(1e usdcUsdDec)
                uint256 num = usdPerGram_1 * (10 ** usdcDecimals) * (10 ** usdcUsdDec);
                uint256 den = (10 ** xauDec) * uint256(usdcAnswer);
                upg = num / den; // floors
            } else {
                // Assume USDC ≈ $1 — convert USD/gram to USDC units directly
                // usdcPerGram = usdPerGram(1e xauDec) * (10^usdcDecimals) / (10^xauDec)
                upg = (usdPerGram_1 * (10 ** usdcDecimals)) / (10 ** xauDec);
                usdcUpdatedAt = xauUpdatedAt; // same as xau
                usdcRoundId   = 0;
            }
        }
    }

    // ========= Redemption (same UX, now backed by oracle-cached price) =========

    function redeem(uint256 amountALT) external whenNotPaused nonReentrant {
        _redeemWithCompliance(amountALT, 0, "");
    }

    function redeemWithApproval(uint256 amountALT, uint256 expiry, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
    {
        require(complianceCheckRequired, "Compliance not required");
        require(block.timestamp <= expiry, "Approval expired");

        uint256 nonce = complianceNonce[msg.sender];
        bytes32 digest = _hashComplianceMessage(msg.sender, amountALT, expiry, nonce);
        address signer = ECDSA.recover(ECDSA.toEthSignedMessageHash(digest), signature);
        require(hasRole(COMPLIANCE_ROLE, signer), "Invalid compliance sig");
        complianceNonce[msg.sender]++;

        _redeemWithCompliance(amountALT, expiry, signature);
    }

    function _redeemWithCompliance(uint256 amountALT, uint256 /*expiry*/, bytes memory /*sig*/) internal {
        require(instantRedemptionEnabled, "Instant redemption disabled");
        require(amountALT >= minRedemptionAmount, "Below minimum");
        require(amountALT <= maxRedemptionAmount, "Exceeds maximum");
        require(!blacklisted[msg.sender], "User blacklisted");

        // Require current cached price be set and fresh enough
        require(goldWeightPerALT_g6 > 0 && usdcPerGram > 0, "Rates unset");
        if (rateValidityPeriod > 0) {
            require(block.timestamp - rateUpdatedAt <= rateValidityPeriod, "Price cache expired");
        }

        // Processing window
        require(_isWithinProcessingWindow(), "Outside processing window");

        // Whitelist checks
        require(altgold.isWhitelisted(msg.sender), "User not whitelisted");
        require(altgold.isWhitelisted(address(this)), "Contract not whitelisted");

        // Cooldown
        if (cooldownSeconds > 0) {
            require(block.timestamp >= lastRedemptionTime[msg.sender] + cooldownSeconds, "Cooldown active");
        }

        // Calculate payout (floors)
        uint256 usdcAmount = _calculateUSDCAmount(amountALT);
        require(usdcAmount > 0, "Zero payout");

        // Daily limits (USDC-denominated)
        _checkAndUpdateDailyLimits(msg.sender, usdcAmount);

        // Treasury safety checks
        uint256 availableUSDC = usdc.balanceOf(address(this));
        require(availableUSDC >= usdcAmount + bufferUSDC, "Insufficient USDC reserve");
        if (reserveRequirementBps > 0) {
            uint256 postBal = availableUSDC - usdcAmount;
            // post-balance must be >= (bps * payout) / 10_000
            require(postBal * 10_000 >= uint256(reserveRequirementBps) * usdcAmount, "Violates reserve ratio");
        }

        // Pull ALT
        IERC20Upgradeable(address(altgold)).safeTransferFrom(msg.sender, address(this), amountALT);

        // Emit request snapshot BEFORE settlement
        uint256 redemptionId = nextRedemptionId++;
        emit RedemptionRequested(redemptionId, msg.sender, amountALT, usdcAmount, block.timestamp, goldWeightPerALT_g6, usdcPerGram);

        // Burn then pay (atomic)
        string memory reason = string(abi.encodePacked("REDEMPTION#", _toString(redemptionId)));
        altgold.burn(address(this), amountALT, reason);
        usdc.safeTransfer(msg.sender, usdcAmount);

        // Record + stats
        bytes32 traceId = keccak256(abi.encodePacked(redemptionId, msg.sender, amountALT, usdcAmount, block.timestamp));
        redemptions[redemptionId] = RedemptionRecord({
            id: redemptionId,
            user: msg.sender,
            amountALT: amountALT,
            amountUSDC: usdcAmount,
            timestamp: block.timestamp,
            snapshotWeight_g6: goldWeightPerALT_g6,
            snapshotUSDCPerGram: usdcPerGram,
            traceId: traceId
        });
        userRedemptions[msg.sender].push(redemptionId);

        totalRedeemedALT += amountALT;
        totalPaidUSDC    += usdcAmount;
        totalRedemptionCount++;
        userTotalRedeemed[msg.sender] += amountALT;
        userRedemptionCount[msg.sender]++;
        lastRedemptionTime[msg.sender] = block.timestamp;

        emit RedemptionCompleted(redemptionId, msg.sender, amountALT, usdcAmount, block.timestamp, traceId);
    }

    // ========= Admin: economics & policy (weight + validity; price is oracle-managed) =========

    /// @notice Update grams of gold backing per 1.0 ALT (×1e6).
    function setGoldWeightPerALT(uint256 newWeight_g6) external onlyRole(RATE_MANAGER_ROLE) {
        require(newWeight_g6 > 0, "weight=0");
        uint256 oldUPG = usdcPerGram;
        uint256 oldW   = goldWeightPerALT_g6;
        goldWeightPerALT_g6 = newWeight_g6;
        emit RatesUpdated(oldW, newWeight_g6, oldUPG, oldUPG, msg.sender);
    }

    /// @notice Adjust how long a cached oracle price remains valid for redeem().
    function setRateValidityPeriod(uint256 seconds_) external onlyRole(RATE_MANAGER_ROLE) {
        rateValidityPeriod = seconds_;
    }

    function updateLimits(
        uint256 _minRedemption,
        uint256 _maxRedemption,
        uint256 _globalDailyLimit,
        uint256 _userDailyLimit,
        uint256 _cooldown
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_minRedemption > 0 && _minRedemption <= _maxRedemption, "Invalid limits");
        minRedemptionAmount   = _minRedemption;
        maxRedemptionAmount   = _maxRedemption;
        globalDailyLimitUSDC  = _globalDailyLimit; // 0 disables
        userDailyLimitUSDC    = _userDailyLimit;   // 0 disables
        cooldownSeconds       = _cooldown;         // 0 disables
        emit LimitsUpdated(_minRedemption, _maxRedemption, _globalDailyLimit, _userDailyLimit, _cooldown, msg.sender);
    }

    function setRedemptionSettings(bool _instantEnabled, bool _complianceRequired)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        instantRedemptionEnabled = _instantEnabled;
        complianceCheckRequired  = _complianceRequired;
        emit RedemptionSettingsUpdated(_instantEnabled, _complianceRequired, msg.sender);
    }

    function setProcessingWindow(bool enabled, uint8 startHour, uint8 endHour)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(startHour <= 23 && endHour <= 24, "Invalid hours");
        require(!enabled || startHour != endHour, "invalid window");
        processingWindow = ProcessingWindow(enabled, startHour, endHour);
        emit ProcessingWindowUpdated(enabled, startHour, endHour, msg.sender);
    }

    function updateBlacklist(address user, bool blacklist) external onlyRole(COMPLIANCE_ROLE) {
        blacklisted[user] = blacklist;
        emit UserBlacklistUpdated(user, blacklist, msg.sender);
    }

    function setBuffer(uint256 newBuffer) external onlyRole(TREASURER_ROLE) {
        uint256 old = bufferUSDC; bufferUSDC = newBuffer;
        emit BufferUpdated(old, newBuffer, msg.sender);
    }

    function setReserveRequirementBps(uint16 newBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newBps <= 10_000, "bps>10000");
        uint16 old = reserveRequirementBps; reserveRequirementBps = newBps;
        emit ReserveRequirementUpdated(old, newBps, msg.sender);
    }

    // ========= Treasury =========

    function depositUSDC(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit USDCDeposited(msg.sender, amount);
    }

    function withdrawUSDC(address to, uint256 amount) external onlyRole(TREASURER_ROLE) nonReentrant {
        require(to != address(0) && amount > 0, "bad params");
        uint256 bal = usdc.balanceOf(address(this));
        require(bal >= amount + bufferUSDC, "violates buffer");
        usdc.safeTransfer(to, amount);
        emit USDCWithdrawn(to, amount, msg.sender);
    }

    // ========= Emergency (timelocked) =========

    function scheduleEmergencyWithdrawal(address recipient, uint256 amount) external onlyRole(EMERGENCY_ROLE) {
        require(recipient != address(0) && amount > 0, "bad params");
        require(!emergencyPlan.scheduled, "already scheduled");
        emergencyPlan = EmergencyWithdrawal(true, recipient, amount, block.timestamp + emergencyDelay);
        emit EmergencyScheduled(recipient, amount, emergencyPlan.executeAfter);
    }

    function executeEmergencyWithdrawal() external onlyRole(EMERGENCY_ROLE) nonReentrant {
        require(emergencyPlan.scheduled, "not scheduled");
        require(block.timestamp >= emergencyPlan.executeAfter, "locked");
        address to = emergencyPlan.recipient; uint256 amt = emergencyPlan.amount;
        delete emergencyPlan;
        usdc.safeTransfer(to, amt);
        emit EmergencyExecuted(to, amt);
    }

    function cancelEmergencyWithdrawal() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(emergencyPlan.scheduled, "not scheduled");
        delete emergencyPlan;
        emit EmergencyCancelled();
    }

    // ========= Pause =========
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ========= Views =========

    function previewRedemption(uint256 amountALT) external view returns (uint256) {
        return _calculateUSDCAmount(amountALT);
    }

    function getCurrentExchangeRate() external view returns (uint256) {
        return _calculateUSDCAmount(10 ** altDecimals);
    }

    function getReserveStatus() external view returns (uint256 totalReserve, uint256 availableForRedemption, uint256 buffer) {
        totalReserve = usdc.balanceOf(address(this));
        buffer = bufferUSDC;
        availableForRedemption = totalReserve > buffer ? totalReserve - buffer : 0;
    }

    function getUserRedemptionHistory(address user) external view returns (RedemptionRecord[] memory) {
        uint256[] memory ids = userRedemptions[user];
        RedemptionRecord[] memory history = new RedemptionRecord[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) history[i] = redemptions[ids[i]];
        return history;
    }

    function getUserStats(address user) external view returns (uint256 totalRedeemed, uint256 redemptionCount, uint256 dailyUsed, uint256 lastRedemption) {
        uint256 today = _currentDayStartView();
        uint256 uStart = userDayStart[user];
        uint256 uDaily = (today > uStart) ? 0 : userDailyUsedUSDC[user];
        return (userTotalRedeemed[user], userRedemptionCount[user], uDaily, lastRedemptionTime[user]);
    }

    function getGlobalStats() external view returns (uint256 totalALTRedeemed_, uint256 totalUSDCPaid_, uint256 totalRedemptions_, uint256 dailyVolumeUSDC_) {
        uint256 today = _currentDayStartView();
        uint256 dailyUsed = (today > currentDayStart) ? 0 : globalDailyUsedUSDC;
        return (totalRedeemedALT, totalPaidUSDC, totalRedemptionCount, dailyUsed);
    }

    // ========= Internal helpers =========

    function _calculateUSDCAmount(uint256 amountALT) internal view returns (uint256) {
        // gramsQ6 = (amountALT * goldWeightPerALT_g6) / 10^altDecimals
        uint256 gramsQ6 = (amountALT * goldWeightPerALT_g6) / (10 ** altDecimals);
        // usdcAmount = (gramsQ6 * usdcPerGram) / 1e6
        return (gramsQ6 * usdcPerGram) / WEIGHT_PRECISION;
    }

    function _isWithinProcessingWindow() internal view returns (bool) {
        if (!processingWindow.enabled) return true;
        uint256 hour = (block.timestamp / 1 hours) % 24;
        if (processingWindow.startHour < processingWindow.endHour) {
            return hour >= processingWindow.startHour && hour < processingWindow.endHour;
        } else {
            return hour >= processingWindow.startHour || hour < processingWindow.endHour;
        }
    }

    function _startOfTodayUTC() internal view returns (uint256) {
        return (block.timestamp / 1 days) * 1 days;
    }
    function _currentDayStartView() internal view returns (uint256) {
        return (block.timestamp / 1 days) * 1 days;
    }
    function _updateDayIfNeeded() internal {
        uint256 today = _startOfTodayUTC();
        if (today > currentDayStart) { currentDayStart = today; globalDailyUsedUSDC = 0; }
    }
    function _updateUserDayIfNeeded(address user) internal {
        uint256 today = _startOfTodayUTC();
        if (today > userDayStart[user]) { userDayStart[user] = today; userDailyUsedUSDC[user] = 0; }
    }
    function _checkAndUpdateDailyLimits(address user, uint256 usdcAmount) internal {
        _updateDayIfNeeded();
        _updateUserDayIfNeeded(user);
        if (globalDailyLimitUSDC > 0) {
            require(globalDailyUsedUSDC + usdcAmount <= globalDailyLimitUSDC, "Global limit");
        }
        if (userDailyLimitUSDC > 0) {
            require(userDailyUsedUSDC[user] + usdcAmount <= userDailyLimitUSDC, "User limit");
        }
        globalDailyUsedUSDC += usdcAmount;
        userDailyUsedUSDC[user] += usdcAmount;
    }

    function _hashComplianceMessage(address user, uint256 amountALT, uint256 expiry, uint256 nonce)
        internal view returns (bytes32)
    {
        return keccak256(abi.encodePacked("ALTGOLD_REDEEM", user, amountALT, expiry, nonce, block.chainid, address(this)));
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 j=v; uint256 len; while (j!=0){len++; j/=10;}
        bytes memory b = new bytes(len); uint256 k=len;
        while (v!=0){k--; b[k]=bytes1(uint8(48+v%10)); v/=10;} return string(b);
    }

    // ========= UUPS =========
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function supportsInterface(bytes4 interfaceId)
        public view override(AccessControlUpgradeable) returns (bool)
    { return super.supportsInterface(interfaceId); }
}

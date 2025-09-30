# ALT GOLD

<div align="center">

<strong>Gold-backed ALTGOLD token and instant Redemption on Ethereum Sepolia</strong>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-363636?logo=solidity&logoColor=white)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-F7DF1E?logo=hardhat&logoColor=000)](https://hardhat.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-4E5EE4?logo=openzeppelin&logoColor=white)](https://www.openzeppelin.com/)
[![Sepolia](https://img.shields.io/badge/Network-Sepolia-848484)](https://sepolia.etherscan.io/)

<br/>

<a href="https://sepolia.etherscan.io/address/0x6eDf5B5B53014e0249955142cE12026Cce055296#code"><b>ALTGOLDToken (Proxy) on Etherscan</b></a>
·
<a href="https://sepolia.etherscan.io/address/0x88b2DF0C0fFd9eE80e2e230dEA71e324Ac4f9049#code"><b>ALTGOLDRedemption on Etherscan</b></a>
·

·
<a href="https://docs.google.com/document/d/1HowUSKs8Ap7a5gRVd9J2bkAS1l69jcD-LspAMqxyoQM/edit?usp=sharing"><b>Technical Documentation (PDF)</b></a>

<br/>

[🚀 Quick Start](#prerequisites) • [🧪 Tests](#run-tests-on-sepolia) • [🛠️ Ops](#unified-ops-script) • [📊 Gas Reports](#gas-reports) • [🔐 Security](#security-considerations-and-trade-offs)

</div>

## ALT GOLD – Contracts, Deployment, Testing, and Ops

This repository contains the ALTGOLD token (`ALTGOLDToken`) and the Redemption contract (`ALTGOLDRedemption`), with end-to-end scripts for deployment, configuration, testing, and gas reporting on Sepolia and locally.

### Prerequisites
- Node.js 18+ (Hardhat warns on 18; 22 LTS recommended)
- Install dependencies:
  - `npm install`
- Configure `.env` with at least:
  - `SEPOLIA_URL`
  - `ETHERSCAN_API_KEY`
  - `PRIVATE_KEY`, `PRIVATE_KEY_1`, `PRIVATE_KEY_2`, `PRIVATE_KEY_3`
  - `ALTGOLD_TOKEN_ADDRESS` (UUPS proxy on Sepolia)
  - `REDEMPTION_ADDRESS` (on Sepolia)
  - `MOCK_USDC_ADDRESS` (USDC-6 on Sepolia)

### Install & Build
```
npm ci
npx hardhat compile
```

## Deployment Details (Sepolia)

- **Network**: Sepolia (chainId 11155111)
- **ALTGOLDToken (UUPS Proxy)**
  - Proxy Address: `0x6eDf5B5B53014e0249955142cE12026Cce055296`
  - Etherscan: `https://sepolia.etherscan.io/address/0x6eDf5B5B53014e0249955142cE12026Cce055296#code`
- **ALTGOLDRedemption**
  - Address: `0x88b2DF0C0fFd9eE80e2e230dEA71e324Ac4f9049`
  - Etherscan: `https://sepolia.etherscan.io/address/0x88b2DF0C0fFd9eE80e2e230dEA71e324Ac4f9049#code`
- **USDC (Mock/Test)**
  - Address: `0xFD6aB5BF624E879C9E78A5bc78BF205CaB866AC6`
  - Note: 6 decimals; used for redemption funding.

### ABIs
Built artifacts (ABIs) are available after `npx hardhat compile`:
- `artifacts/contracts/ALTGOLDToken.sol/ALTGOLDToken.json`
- `artifacts/contracts/redemption.sol/ALTGOLDRedemption.json`
- `artifacts/contracts/TestUSDC.sol/TestUSDC.json` (local mock for gas runs)

You can import these JSON files in dApps or scripts to interact with the deployed contracts.

## System Architecture

### System Overview

```mermaid
erDiagram
    USER ||--o{ ALTGOLD_TOKEN : holds
    USER ||--o{ REDEMPTION_CONTRACT : redeems
    ALTGOLD_TOKEN ||--|| GOLD_RESERVE : backed_by
    REDEMPTION_CONTRACT ||--|| USDC_TOKEN : pays_with
    REDEMPTION_CONTRACT ||--|| ALTGOLD_TOKEN : burns
    REDEMPTION_CONTRACT ||--|| CHAINLINK_ORACLE : reads_price
    ADMIN ||--o{ ROLE_ASSIGNMENT : manages
    ROLE_ASSIGNMENT ||--o{ ALTGOLD_TOKEN : governs
    ROLE_ASSIGNMENT ||--o{ REDEMPTION_CONTRACT : governs

    USER {
        address wallet_address
        bool is_whitelisted
        bool is_blacklisted
        uint256 balance
        uint256 daily_redemption_used
        uint256 total_redeemed
        uint256 last_redemption_time
        uint256 compliance_nonce
    }

    ALTGOLD_TOKEN {
        string name "ALT GOLD"
        string symbol "ALTGOLD"
        uint8 decimals "6"
        uint256 total_supply
        uint256 total_minted
        uint256 total_burned
        bool paused
        bool circuit_breaker_active
    }

    GOLD_RESERVE {
        uint256 total_grams
        uint256 token_per_gram
        uint256 verified_at
        address verified_by
        string audit_reference
        uint256 max_mintable_tokens
    }

    REDEMPTION_CONTRACT {
        uint256 gold_weight_per_alt_g6
        uint256 usdc_per_gram
        uint256 rate_updated_at
        uint256 buffer_usdc
        uint16 reserve_requirement_bps
        bool instant_redemption_enabled
        bool compliance_check_required
    }

    CHAINLINK_ORACLE {
        address xau_usd_feed
        address usdc_usd_feed
        uint256 staleness_threshold
        uint16 max_deviation_bps
        uint256 min_usdc_per_gram
        uint256 max_usdc_per_gram
    }

    ROLE_ASSIGNMENT {
        bytes32 role_type
        address assignee
        address contract
        uint256 granted_at
    }
```

### Role Hierarchy

```
┌─────────────────────────────────────────────────┐
│              DEFAULT_ADMIN_ROLE                  │
│         (Multisig - Ultimate Control)            │
└─────────────────┬───────────────────────────────┘
                  │
    ┌─────────────┴─────────────────────────┐
    │                                       │
┌───▼────────────┐              ┌──────────▼──────────┐
│  ALTGOLD Token │              │ Redemption Contract │
│     Roles      │              │      Roles          │
└───┬────────────┘              └──────────┬──────────┘
    │                                      │
    ├─► SUPPLY_CONTROLLER_ROLE             ├─► TREASURER_ROLE
    ├─► WHITELIST_MANAGER_ROLE             ├─► COMPLIANCE_ROLE
    ├─► PAUSER_ROLE                        ├─► RATE_MANAGER_ROLE
    ├─► COMPLIANCE_OFFICER_ROLE            ├─► PAUSER_ROLE
    ├─► AUDITOR_ROLE                       └─► EMERGENCY_ROLE
    ├─► RESERVE_MANAGER_ROLE
    ├─► EXECUTOR_ROLE
    └─► BURNER_ROLE
```

### User Interaction Flow

#### 1. Token Acquisition Flow
```
User → [Must be Whitelisted] → ALTGOLD Token Contract
                                      │
                                      ▼
                            [Receive via Transfer]
                                  OR
                            [Admin Mints to User]
```

#### 2. Redemption Flow
```
User Journey:
─────────────
1. User holds ALTGOLD tokens
           │
           ▼
2. Approves Redemption Contract to spend ALTGOLD
           │
           ▼
3. Calls redeem() or redeemWithApproval()
           │
           ▼
4. Contract Checks:
   - User whitelisted? ✓
   - Not blacklisted? ✓
   - Within limits? ✓
   - Cooldown passed? ✓
   - Oracle price fresh? ✓
   - USDC reserve sufficient? ✓
           │
           ▼
5. Atomic Settlement:
   a. Pull ALTGOLD from user
   b. Burn ALTGOLD tokens
   c. Transfer USDC to user
           │
           ▼
6. Redemption Complete
```

### Contract Function Map

#### ALTGOLD Token Core Functions

**Public/External Functions:**
```
──────────────────────────
Users:
  • transfer(to, amount)
  • approve(spender, amount)
  • transferFrom(from, to, amount)
```

**Admin Functions by Role:**

```
SUPPLY_CONTROLLER:
  • mint(to, amount, reason)
  • burn(from, amount, reason)

WHITELIST_MANAGER:
  • addToWhitelist(account, kycRef)
  • removeFromWhitelist(account)
  • batchUpdateWhitelist(accounts[], statuses[], kycRefs[])

AUDITOR:
  • updateGoldReserve(totalGrams, tokenPerGram, auditRef)

RESERVE_MANAGER:
  • updateMintingLimits(perTx, daily, weekly, threshold, cooldown, maxDaily)

EXECUTOR:
  • executeMintRequest(requestId)

PAUSER:
  • pause(reason)
  • unpause(reason)

COMPLIANCE_OFFICER:
  • updateComplianceSettings(mode, maxTransfer, minHolding)

DEFAULT_ADMIN:
  • cancelMintRequest(requestId, reason)
  • resetCircuitBreaker()
  • setAuthorizedBurner(address, status)
```

#### Redemption Contract Core Functions

**Public/External Functions:**
```
──────────────────────────
Users:
  • redeem(amountALT)
  • redeemWithApproval(amountALT, expiry, signature)
  • depositUSDC(amount)

Oracle Updates (Permissionless):
  • updateUsdcPerGramFromOracle()
  • previewOracleUsdcPerGram() [view]
```

**Admin Functions by Role:**

```
RATE_MANAGER:
  • setGoldWeightPerALT(weight_g6)
  • setRateValidityPeriod(seconds)

TREASURER:
  • withdrawUSDC(to, amount)
  • setBuffer(amount)

COMPLIANCE:
  • updateBlacklist(user, status)

EMERGENCY:
  • scheduleEmergencyWithdrawal(recipient, amount)
  • executeEmergencyWithdrawal()

PAUSER:
  • pause()
  • unpause()

DEFAULT_ADMIN:
  • setOracleFeeds(xauFeed, usdcFeed)
  • setOracleConfig(staleness, deviation, min, max)
  • updateLimits(min, max, globalDaily, userDaily, cooldown)
  • setRedemptionSettings(instantEnabled, complianceRequired)
  • setProcessingWindow(enabled, startHour, endHour)
  • setReserveRequirementBps(bps)
  • cancelEmergencyWithdrawal()
```

### Data Flow Diagram

#### Minting Process
```
Gold Audit → Auditor Updates Reserve → Calculate Max Mintable
                                              │
                                              ▼
Supply Controller → Mint Request → Under Threshold? 
                                    │            │
                                    Yes          No
                                    │            │
                                    ▼            ▼
                              Immediate    24hr Timelock
                                Mint         Required
                                    │            │
                                    └────────────┘
                                          │
                                          ▼
                                    Tokens Created
```

#### Redemption Process
```
Chainlink Oracles → XAU/USD Price → Calculate USDC/gram
                         │
                         ▼
User Request → Check Oracle Cache → Fresh? → Calculate Payout
                                      │
                                      ▼
                              Burn ALTGOLD → Pay USDC
```

## Unified Ops Script
The consolidated ops script orchestrates common flows on Sepolia:

```
node scripts/redemption-ops.js deploy
# copy the printed address and set it in .env as REDEMPTION_ADDRESS=0x...
node scripts/redemption-ops.js whitelist
node scripts/redemption-ops.js grant-roles
node scripts/redemption-ops.js fund-usdc 200000
node scripts/redemption-ops.js fund-alt 50
node scripts/redemption-ops.js show-status
```

Notes:
- `fund-usdc` amount is in USDC units (6 decimals). `200000` => 200,000 USDC.
- `fund-alt` defaults to the token minimum holding if no amount is provided. `50` => 50 ALTGOLD.
- `show-status` prints current rate, buffer, and contract balances to ensure prerequisites before testing.

## Run Tests on Sepolia

### Quick Commands
```
# Run all tests
npx hardhat test --network sepolia

# Token tests
npx hardhat test test/ALTGOLDToken.roles-and-compliance.test.js --network sepolia

# Redemption tests
npx hardhat test test/Redemption.test.js --network sepolia
```
After running the setup above:

```
# Redemption tests
npx hardhat test test/Redemption.test.js --network sepolia

# ALTGOLD token tests 
npx hardhat test test/ALTGOLDToken.test.js --network sepolia
npx hardhat test test/ALTGOLDToken.roles-and-compliance.test.js --network sepolia
```

## Verify Contracts 
```
npm run verify:altgold:sepolia
npm run verify:redemption:sepolia
```

## Troubleshooting
- If you see `replacement transaction underpriced`, re-run command; ops script slows down role grants already.
- If redemption reverts `Below minimum holding requirement`, fund ALTGOLD to the redemption contract: `node scripts/redemption-ops.js fund-alt 50`.
- If payout shows as 0, ensure rates are set and current: `node scripts/redemption-ops.js fix-rates` and re-check `show-status`.

---

## Security Layer

```
┌─────────────────────────────────────┐
│         Security Controls           │
├─────────────────────────────────────┤
│ 1. Role-Based Access Control        │
│    └─ 8 distinct roles per contract │
├─────────────────────────────────────┤
│ 2. Whitelist/Blacklist System       │
│    └─ KYC/AML compliance            │
├─────────────────────────────────────┤
│ 3. Multi-tier Limits                │
│    ├─ Per-transaction limits        │
│    ├─ Daily/weekly limits           │
│    └─ User cooldowns                │
├─────────────────────────────────────┤
│ 4. Gold Reserve Backing             │
│    └─ Cannot mint beyond reserves   │
├─────────────────────────────────────┤
│ 5. Circuit Breaker                  │
│    └─ Auto-pause on anomalies       │
├─────────────────────────────────────┤
│ 6. Timelock Mechanism                │
│    └─ 24hr delay for large mints    │
├─────────────────────────────────────┤
│ 7. Oracle Price Validation          │
│    ├─ Staleness checks              │
│    ├─ Deviation limits              │
│    └─ Min/max bounds                │
├─────────────────────────────────────┤
│ 8. Reserve Requirements             │
│    └─ Buffer + ratio checks         │
├─────────────────────────────────────┤
│ 9. Compliance Signatures            │
│    └─ Optional off-chain approval   │
├─────────────────────────────────────┤
│ 10. Emergency Controls              │
│     └─ Pause + timelocked withdraw  │
└─────────────────────────────────────┘
```


Storage Layout Choices 
ALTGOLDToken Contract Storage Layout
Core State Variables Ordering

```

// Slot 0-39: OpenZeppelin Base Contracts (Reserved)
// ├── ERC20Upgradeable storage
// ├── PausableUpgradeable storage  
// ├── AccessControlUpgradeable storage
// ├── ReentrancyGuardUpgradeable storage
// └── UUPSUpgradeable storage

// Slot 40-45: Whitelist Management
mapping(address => WhitelistData) private _whitelistData;     // Slot 40
address[] private _whitelistedAddresses;                       // Slot 41
mapping(address => uint256) private _addressIndex;             // Slot 42
uint256 private _totalWhitelisted;                             // Slot 43

// Slot 44-46: Gold Reserve Data
GoldReserve public goldReserve;                                // Slot 44 (struct)
uint256 public lastReserveUpdate;                              // Slot 45
uint256 public reserveUpdateFrequency;                         // Slot 46

// Slot 47-48: Minting Controls
MintingLimits public mintingLimits;                           // Slot 47 (struct)
MintingStats public mintingStats;                             // Slot 48 (struct)

// Slot 49-52: Timelock & Requests
mapping(uint256 => MintRequest) public mintRequests;          // Slot 49
uint256 public nextRequestId;                                 // Slot 50
uint256 public pendingMints;                                  // Slot 51

// Slot 52-55: Circuit Breaker
bool public circuitBreakerActive;                             // Slot 52 (packed)
uint256 public circuitBreakerTriggeredAt;                     // Slot 53
uint256 public anomalyCounter;                                // Slot 54
uint256 public lastAnomalyReset;                              // Slot 55

// Slot 56-59: Compliance
bool public complianceMode;                                   // Slot 56 (packed)
uint256 public maxTransferAmount;                             // Slot 57
uint256 public minHoldingAmount;                              // Slot 58
uint256 public lastComplianceCheck;                           // Slot 59

// Slot 60-65: Statistics
uint256 public totalMinted;                                   // Slot 60
uint256 public totalBurned;                                   // Slot 61
uint256 public transferCount;                                 // Slot 62
uint256 public successfulMints;                               // Slot 63
uint256 public cancelledMints;                                // Slot 64

// Slot 65: Authorized Burners
mapping(address => bool) public authorizedBurners;            // Slot 65

// Slot 66-115: Storage Gap
uint256[50] private __gap;                                    // Future-proofing
```

Reason for Token Storage Choices
1. Whitelist Data First (Slots 40-43)

Rationale: Most frequently accessed data in every transfer
Gas Optimization: Hot storage slots for transfer operations
Security: Critical compliance data in predictable locations

2. Struct Packing Strategy

```
struct WhitelistData {
    bool isWhitelisted;      // 1 byte
    uint128 addedAt;         // 16 bytes  
    uint128 removedAt;       // 16 bytes
    address addedBy;         // 20 bytes (new slot)
    string kycReferenceId;   // Dynamic (new slot)
}
```
Reason:

Bool + two uint128s fit in single slot (32 bytes)
Timestamp precision sufficient with uint128 (valid until year 10^38)
Address and string in separate slots (unavoidable)

3. Reserve and Limits as Structs (Slots 44, 47-48)

Rationale: Logical grouping of related data
Benefit: Single SLOAD for multiple related values
Trade-off: More complex upgrades, but cleaner code

4. Circuit Breaker Variables Sequential (Slots 52-55)

Rationale: Related emergency data together
Optimization: Likely accessed together during anomaly checks
Pattern: Status → Timestamp → Counters

5. Statistics at End (Slots 60-64)

Rationale: Write-only during operations, read-only for reporting
Gas: Separated from hot paths to avoid unnecessary SLOADs
Upgrade Safety: Can extend statistics without affecting core logic


ALTGOLDRedemption Contract Storage Layout
Redemption Contract Storage Organization

```
// Slot 0-39: OpenZeppelin Base (Reserved)

// Slot 40-43: Token References
IALTGOLDMinimal public altgold;                              // Slot 40
IERC20Upgradeable public usdc;                               // Slot 41  
uint8 public altDecimals;                                    // Slot 42 (packed)
uint8 public usdcDecimals;                                   // Slot 42 (packed)

// Slot 43-46: Economics
uint256 public goldWeightPerALT_g6;                          // Slot 43
uint256 public usdcPerGram;                                  // Slot 44
uint256 public rateUpdatedAt;                                // Slot 45
uint256 public rateValidityPeriod;                           // Slot 46

// Slot 47-49: Oracle Configuration  
AggregatorV3Interface public xauUsdFeed;                     // Slot 47
AggregatorV3Interface public usdcUsdFeed;                    // Slot 48
bool public useUsdcUsdFeed;                                  // Slot 49 (packed)
uint256 public oracleStalenessThreshold;                     // Slot 50
uint16 public maxUpdateDeviationBps;                         // Slot 51 (packed)
uint256 public minUsdcPerGram;                               // Slot 52
uint256 public maxUsdcPerGram;                               // Slot 53

// Slot 54-57: Redemption Settings
uint256 public minRedemptionAmount;                          // Slot 54
uint256 public maxRedemptionAmount;                          // Slot 55
bool public instantRedemptionEnabled;                        // Slot 56 (packed)
bool public complianceCheckRequired;                         // Slot 56 (packed)

// Slot 57-62: Limits & Cooldowns
uint256 public globalDailyLimitUSDC;                         // Slot 57
uint256 public userDailyLimitUSDC;                           // Slot 58
uint256 public cooldownSeconds;                              // Slot 59
uint256 public currentDayStart;                              // Slot 60
uint256 public globalDailyUsedUSDC;                          // Slot 61

// Slot 62-64: User Tracking (Mappings)
mapping(address => uint256) public userDayStart;             // Slot 62
mapping(address => uint256) public userDailyUsedUSDC;        // Slot 63
mapping(address => uint256) public lastRedemptionTime;       // Slot 64
mapping(address => uint256) public complianceNonce;          // Slot 65

// Slot 66-67: Treasury
uint256 public bufferUSDC;                                   // Slot 66
uint16 public reserveRequirementBps;                         // Slot 67 (packed)

// Slot 68-70: Processing Window
ProcessingWindow public processingWindow;                    // Slot 68 (struct)

// Slot 69-72: Redemption Records
mapping(uint256 => RedemptionRecord) public redemptions;     // Slot 69
mapping(address => uint256[]) public userRedemptions;        // Slot 70
uint256 public nextRedemptionId;                             // Slot 71

// Slot 72-77: Statistics
uint256 public totalRedeemedALT;                             // Slot 72
uint256 public totalPaidUSDC;                                // Slot 73
uint256 public totalRedemptionCount;                         // Slot 74
mapping(address => uint256) public userTotalRedeemed;        // Slot 75
mapping(address => uint256) public userRedemptionCount;      // Slot 76

// Slot 77-127: Storage Gap
uint256[50] private __gap;

```

Justification for Redemption Storage Choices
1. Token References First (Slots 40-42)

Rationale: Immutable after initialization, frequently read
Packing: Both decimals in single byte each, same slot
Security: Critical external dependencies at known locations

2. Economics Before Oracle (Slots 43-46)

Rationale: Core pricing data accessed on every redemption
Separation: Manual rates vs oracle rates clearly delineated
Caching: usdcPerGram cached from oracle for gas savings

3. Oracle Configuration Grouped (Slots 47-53)

Rationale: All oracle-related settings together
Access Pattern: Read together during price updates
Packing: useUsdcUsdFeed bool and maxUpdateDeviationBps uint16 packed

4. Daily Limit Tracking Sequential (Slots 57-61)

Rationale: Reset logic accesses these together
Pattern: Limits → Current period → Usage
Optimization: Minimizes SLOADs during limit checks

5. User Mappings Clustered (Slots 62-65)

Rationale: User-specific data isolated
Gas: Each mapping gets unique storage tree
Privacy: User data not mixed with system data

### External Dependencies

```
1. Chainlink Oracles
   ├─ XAU/USD Feed (Gold price)
   └─ USDC/USD Feed (Stablecoin price)

2. USDC Token Contract
   └─ ERC20 standard interface

3. Multisig Wallet (e.g., Gnosis Safe)
   └─ For DEFAULT_ADMIN_ROLE

4. KYC/Compliance System
   └─ Off-chain signature generation
```

## Security Considerations and Trade-offs

- **Upgradeable (UUPS)**
  - `ALTGOLDToken` and `ALTGOLDRedemption` use UUPS. Only `DEFAULT_ADMIN_ROLE` can authorize upgrades. Implementation constructors call `_disableInitializers()`; initialization happens via proxy `initialize`.
  - Trade-off: upgrade authority is powerful; secure admin keys and consider multi-sig.

- **RBAC and Separation of Duties** (ALTGOLD)
  - Roles: `DEFAULT_ADMIN_ROLE`, `SUPPLY_CONTROLLER_ROLE`, `WHITELIST_MANAGER_ROLE`, `PAUSER_ROLE`, `COMPLIANCE_OFFICER_ROLE`, `AUDITOR_ROLE`, `RESERVE_MANAGER_ROLE`, `EXECUTOR_ROLE`, `BURNER_ROLE`.
  - Trade-off: operational complexity; document keyholders and rotation.

- **Compliance & Whitelisting**
  - Transfers require both sender/recipient whitelisted (or authorized burner). Min-holding and max-transfer checks enforced when `complianceMode` is enabled.
  - Redemption requires contract address whitelisted to satisfy min-holding constraints during burns.

- **Circuit Breaker** (ALTGOLD)
  - Auto-triggers on anomalous activity (e.g., large mints, stale reserves). Requires admin to reset after timelock.

- **Gold Reserve Backing**
  - Minting gated by measured reserves and `tokenPerGram` ratio. `getMaxMintableTokens()` prevents over-issuance.
  - Trade-off: off-chain reserve attestations required; auditor trust is implied.

- **Redemption Limits & Treasury Safety**
  - Global and per-user daily USDC limits, cooldowns, processing window, `bufferUSDC`, and optional reserve ratio bps.
  - Trade-off: strict limits improve safety but can throttle UX under load.

- **Reentrancy & Pausing**
  - Critical functions are `nonReentrant` and contracts support pausing. Use `PAUSER_ROLE` during incidents.

- **Decimals and Math**
  - ALTGOLD uses 6 decimals for simpler accounting with USDC-6. All conversions use explicit scaling; divisions floor to avoid overpaying.

- **Oracle/Rate Management (Redemption)**
  - Current deployed variant uses direct `usdcPerGram` parameters (per init/ops) or cached from oracle in newer code. Ensure rate freshness and deviation bounds when enabling oracle mode.

---

## Roles Matrix (Quick Reference)

### ALTGOLDToken

| Role | Purpose | Key permissions (non-exhaustive) |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | Governance/admin | Upgrade authorize (`_authorizeUpgrade`), grant/revoke roles |
| `SUPPLY_CONTROLLER_ROLE` | Monetary policy | `mint(to, amount, reason)`, can also `burn` |
| `WHITELIST_MANAGER_ROLE` | Compliance onboarding | `addToWhitelist`, `removeFromWhitelist`, `batchUpdateWhitelist` |
| `PAUSER_ROLE` | Incident response | `pause`, `unpause` |
| `COMPLIANCE_OFFICER_ROLE` | Transfer policy | `updateComplianceSettings` (mode, max transfer, min holding) |
| `AUDITOR_ROLE` | Reserve attestation | `updateGoldReserve(totalGrams, tokenPerGram, auditRef)` |
| `RESERVE_MANAGER_ROLE` | Minting limits | `updateMintingLimits(...)` |
| `EXECUTOR_ROLE` | Timelock execution | `executeMintRequest(requestId)` |
| `BURNER_ROLE` | Supply decrease | `burn(from, amount, reason)` |

Key invariants:
- Transfers and approvals require both parties whitelisted (or sender is authorized burner) when compliance mode is on.
- Minting is bounded by gold reserve backing via `getMaxMintableTokens()`.
- Circuit breaker can temporarily halt mint/transfer flows.

### ALTGOLDRedemption

| Role | Purpose | Key permissions (non-exhaustive) |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | Governance/admin | Set oracle feeds/config, update limits/settings, authorize upgrade |
| `RATE_MANAGER_ROLE` | Economics | `setGoldWeightPerALT`, `setRateValidityPeriod` |
| `TREASURER_ROLE` | Treasury ops | `withdrawUSDC`, `setBuffer` |
| `PAUSER_ROLE` | Incident response | `pause`, `unpause` |
| `COMPLIANCE_ROLE` | Compliance | `updateBlacklist` (per-user) |
| `EMERGENCY_ROLE` | Emergency | `scheduleEmergencyWithdrawal`, `executeEmergencyWithdrawal` |

Operational prerequisites for redemption to succeed:
- Redemption contract must be whitelisted in `ALTGOLDToken` and hold at least the minimum ALTGOLD to satisfy recipient min-holding checks.
- Redemption contract needs burn authority in `ALTGOLDToken` (either `BURNER_ROLE` or authorized burner) to destroy received ALTGOLD.
- Treasury must hold sufficient USDC above `bufferUSDC`.
- Price/rate must be set and valid (either via direct params at init/ops or via oracle cache in newer variant).

---

## Gas Reports

We provide fast, local gas profiling with USD costing using `hardhat-gas-reporter`.

### Generate reports (local)
In one terminal start the local node:
```
npx hardhat node
```
Then run (USD uses `ETH_PRICE` and `GAS_PRICE`):
```
# ALTGOLD token
ETH_PRICE=4167.34 GAS_PRICE=25 REPORT_GAS=true \
  GAS_REPORT_FILE=gas-reports/altgold-local.txt \
  npx hardhat test test/gas.altgold.local.test.js --network localhost

# Redemption
ETH_PRICE=4167.34 GAS_PRICE=25 REPORT_GAS=true \
  GAS_REPORT_FILE=gas-reports/redemption-local.txt \
  npx hardhat test test/gas.redemption.local.test.js --network localhost
```

### Outputs
Reports are written to:
- `gas-reports/altgold-local.txt`
- `gas-reports/redemption-local.txt`

Each report includes per-method min/max/avg gas, call counts, and USD cost at the configured gas and ETH price.

---

## Deployment & Ops – Quick Reference (Sepolia)

```
# Deploy ALTGOLD (UUPS) proxy
npm run deploy:altgold:sepolia

# Verify ALTGOLD (proxy + implementation)
npm run verify:altgold:sepolia

# Redemption lifecycle
node scripts/redemption-ops.js deploy
node scripts/redemption-ops.js whitelist
node scripts/redemption-ops.js grant-roles
node scripts/redemption-ops.js fund-usdc 200000
node scripts/redemption-ops.js fund-alt 50
node scripts/redemption-ops.js show-status
```

Keep `.env` updated with latest addresses printed by the ops script.

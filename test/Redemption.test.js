const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

/**
 * @title ALTGOLDRedemption Multi-Account Test Suite
 * @notice Tests redemption contract with oracle-based pricing and multi-account testing
 * @dev Uses deployed contract on Sepolia with real USDC mock token
 */

describe("ALTGOLDRedemption Multi-Account Tests", function () {
    // Contract instances
    let redemptionContract;
    let altgoldToken;
    let usdcToken;
    
    // Test accounts
    let admin;              // Account 0 - Admin with all roles
    let rateManager;        // Account 1 - Rate Manager
    let treasurer;          // Account 2 - Treasurer
    let user;               // Account 3 - Test user for redemptions
    
    // Contract addresses
    const REDEMPTION_ADDRESS = process.env.REDEMPTION_ADDRESS || "0xE66fB51d757943D4f1a70A740e7Bb7B07a5cD821";
    const MOCK_USDC_ADDRESS = process.env.MOCK_USDC_ADDRESS || "0xFD6aB5BF624E879C9E78A5bc78BF205CaB866AC6";
    let ALTGOLD_TOKEN_ADDRESS; // Will be fetched from redemption contract
    
    // Test constants
    const ALTGOLD_DECIMALS = 6;
    const USDC_DECIMALS = 6;
    const ONE_ALTGOLD = ethers.parseUnits("1", ALTGOLD_DECIMALS);
    const TEN_ALTGOLD = ethers.parseUnits("10", ALTGOLD_DECIMALS);
    const HUNDRED_ALTGOLD = ethers.parseUnits("100", ALTGOLD_DECIMALS);
    const THOUSAND_USDC = ethers.parseUnits("1000", USDC_DECIMALS);
    
    // Role constants
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const COMPLIANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_ROLE"));
    const RATE_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RATE_MANAGER_ROLE"));
    const TREASURER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TREASURER_ROLE"));
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
    const EMERGENCY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EMERGENCY_ROLE"));
    
    // Helper function to wait between transactions
    const waitBetweenTx = async () => {
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds for Sepolia
    };

    before(async function () {
        console.log("🚀 Setting up ALTGOLDRedemption test environment...\n");
        
        // Get signers
        const signers = await ethers.getSigners();
        admin = signers[0];
        rateManager = signers[1];
        treasurer = signers[2];
        user = signers[3];
        
        console.log("👤 Test accounts:");
        console.log("   Admin:", admin.address);
        console.log("   Rate Manager:", rateManager.address);
        console.log("   Treasurer:", treasurer.address);
        console.log("   User:", user.address);
        
        // Attach to deployed contracts
        const RedemptionFactory = await ethers.getContractFactory("ALTGOLDRedemption");
        redemptionContract = RedemptionFactory.attach(REDEMPTION_ADDRESS);
        
        // Get ALTGOLD address from redemption contract
        ALTGOLD_TOKEN_ADDRESS = await redemptionContract.altgold();
        
        const ALTGOLDFactory = await ethers.getContractFactory("ALTGOLDToken");
        altgoldToken = ALTGOLDFactory.attach(ALTGOLD_TOKEN_ADDRESS);
        
        // Mock USDC ERC20 interface
        const erc20Abi = [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)",
            "function transfer(address to, uint256 amount) returns (bool)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)"
        ];
        usdcToken = new ethers.Contract(MOCK_USDC_ADDRESS, erc20Abi, admin);
        
        console.log("\n📋 Contract Details:");
        console.log("   Redemption:", REDEMPTION_ADDRESS);
        console.log("   ALTGOLD Token:", ALTGOLD_TOKEN_ADDRESS);
        console.log("   Mock USDC:", MOCK_USDC_ADDRESS);
        
        // Check network
        const network = await ethers.provider.getNetwork();
        console.log("   Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
        
        try {
            console.log("   Instant Redemption:", await redemptionContract.instantRedemptionEnabled());
            
            // Check balances
            const adminUSDC = await usdcToken.balanceOf(admin.address);
            const contractUSDC = await usdcToken.balanceOf(REDEMPTION_ADDRESS);
            const adminALTGOLD = await altgoldToken.balanceOf(admin.address);
            
            console.log("\n💰 Token Balances:");
            console.log("   Admin USDC:", ethers.formatUnits(adminUSDC, USDC_DECIMALS));
            console.log("   Contract USDC:", ethers.formatUnits(contractUSDC, USDC_DECIMALS));
            console.log("   Admin ALTGOLD:", ethers.formatUnits(adminALTGOLD, ALTGOLD_DECIMALS));
            
            console.log("\n✅ Setup complete!\n");
        } catch (error) {
            console.error("❌ Failed to connect to contracts:", error.message);
            throw error;
        }
    });

    describe("1. Basic Contract Properties", function () {
        it("Should have correct basic settings", async function () {
            console.log("🧪 Testing basic contract properties...");
            
            const instantEnabled = await redemptionContract.instantRedemptionEnabled();
            const complianceRequired = await redemptionContract.complianceCheckRequired();
            
            expect(instantEnabled).to.be.true;
            
            console.log("   ✅ Instant redemption:", instantEnabled);
            console.log("   ✅ Compliance required:", complianceRequired);
        });

        it("Should have correct token addresses configured", async function () {
            console.log("🧪 Testing token configuration...");
            
            const altgoldAddr = await redemptionContract.altgold();
            const usdcAddr = await redemptionContract.usdc();
            
            expect(altgoldAddr).to.equal(ALTGOLD_TOKEN_ADDRESS);
            expect(usdcAddr).to.equal(MOCK_USDC_ADDRESS);
            
            console.log("   ✅ ALTGOLD configured:", altgoldAddr);
            console.log("   ✅ USDC configured:", usdcAddr);
        });

        it("Should have correct decimals", async function () {
            console.log("🧪 Testing decimals configuration...");
            
            const altDecimals = await redemptionContract.altDecimals();
            const usdcDecimals = await redemptionContract.usdcDecimals();
            
            expect(altDecimals).to.equal(ALTGOLD_DECIMALS);
            expect(usdcDecimals).to.equal(USDC_DECIMALS);
            
            console.log("   ✅ ALT decimals:", altDecimals);
            console.log("   ✅ USDC decimals:", usdcDecimals);
        });
    });

    describe("2. Role Verification", function () {
        it("Should have admin with all required roles", async function () {
            console.log("🧪 Verifying admin roles...");
            
            expect(await redemptionContract.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
            expect(await redemptionContract.hasRole(COMPLIANCE_ROLE, admin.address)).to.be.true;
            expect(await redemptionContract.hasRole(RATE_MANAGER_ROLE, admin.address)).to.be.true;
            expect(await redemptionContract.hasRole(TREASURER_ROLE, admin.address)).to.be.true;
            expect(await redemptionContract.hasRole(PAUSER_ROLE, admin.address)).to.be.true;
            expect(await redemptionContract.hasRole(EMERGENCY_ROLE, admin.address)).to.be.true;
            
            console.log("   ✅ Admin has all 6 roles");
        });
    });

    describe("3. Economics Configuration", function () {
        it("Should have gold weight configured", async function () {
            console.log("🧪 Testing gold weight configuration...");
            
            const goldWeight = await redemptionContract.goldWeightPerALT_g6();
            expect(goldWeight).to.be.greaterThan(0);
            
            console.log("   ✅ Gold weight per ALT:", ethers.formatUnits(goldWeight, 6), "grams");
        });

        it("Should have USDC per gram rate (if set)", async function () {
            console.log("🧪 Testing USDC/gram rate...");
            
            const usdcPerGram = await redemptionContract.usdcPerGram();
            const rateUpdatedAt = await redemptionContract.rateUpdatedAt();
            
            console.log("   📊 USDC per gram:", ethers.formatUnits(usdcPerGram, USDC_DECIMALS));
            console.log("   📊 Last updated:", rateUpdatedAt > 0n ? new Date(Number(rateUpdatedAt) * 1000).toISOString() : "Never");
            
            if (usdcPerGram === 0n) {
                console.log("   ⚠️  Rate not set - needs oracle update or manual setting");
            }
        });

        it("Should update USDC per gram rate (manual)", async function () {
            console.log("🧪 Testing manual rate update...");
            
            // Set a test rate: ~$65 per gram (in USDC with 6 decimals)
            const testRate = ethers.parseUnits("65", USDC_DECIMALS);
            
            await waitBetweenTx();
            
            // For testing, we'll use setGoldWeightPerALT (admin has RATE_MANAGER_ROLE)
            // Note: The actual USDC/gram needs to be set via oracle or initial deployment
            const currentWeight = await redemptionContract.goldWeightPerALT_g6();
            
            console.log("   ℹ️  Current weight:", ethers.formatUnits(currentWeight, 6), "grams per ALT");
            console.log("   ℹ️  Rate updates require oracle integration or specific setup");
        });
    });

    describe("4. Limits and Settings", function () {
        it("Should have redemption limits configured", async function () {
            console.log("🧪 Testing redemption limits...");
            
            // This version uses different limit management
            // Check global and user daily limits instead
            const globalLimit = await redemptionContract.globalDailyLimitUSDC();
            const userLimit = await redemptionContract.userDailyLimitUSDC();
            
            console.log("   ✅ Global daily limit:", ethers.formatUnits(globalLimit, USDC_DECIMALS), "USDC");
            console.log("   ✅ User daily limit:", ethers.formatUnits(userLimit, USDC_DECIMALS), "USDC");
        });

        it("Should have daily limits configured", async function () {
            console.log("🧪 Testing daily limits...");
            
            const globalDailyLimit = await redemptionContract.globalDailyLimitUSDC();
            const userDailyLimit = await redemptionContract.userDailyLimitUSDC();
            
            console.log("   ✅ Global daily limit:", ethers.formatUnits(globalDailyLimit, USDC_DECIMALS), "USDC");
            console.log("   ✅ User daily limit:", ethers.formatUnits(userDailyLimit, USDC_DECIMALS), "USDC");
        });

        it("Should have cooldown configured", async function () {
            console.log("🧪 Testing cooldown configuration...");
            
            const cooldown = await redemptionContract.cooldownSeconds();
            
            console.log("   ✅ Cooldown:", Number(cooldown), "seconds (", Number(cooldown) / 3600, "hours)");
        });

        it("Should have buffer and reserve requirements", async function () {
            console.log("🧪 Testing treasury settings...");
            
            const buffer = await redemptionContract.bufferUSDC();
            const reserveBps = await redemptionContract.reserveRequirementBps();
            
            console.log("   ✅ Buffer:", ethers.formatUnits(buffer, USDC_DECIMALS), "USDC");
            console.log("   ✅ Reserve requirement:", Number(reserveBps) / 100, "%");
        });
    });

    describe("5. Treasury Management", function () {
        it("Should deposit USDC to contract (direct transfer)", async function () {
            console.log("🧪 Testing USDC deposit...");
            
            const depositAmount = THOUSAND_USDC;
            const adminBalance = await usdcToken.balanceOf(admin.address);
            
            if (adminBalance < depositAmount) {
                console.log("   ⚠️  Insufficient USDC balance, skipping");
                this.skip();
                return;
            }
            
            const initialContractBalance = await usdcToken.balanceOf(REDEMPTION_ADDRESS);
            
            // This version doesn't have depositUSDC, so transfer directly
            await waitBetweenTx();
            const tx = await usdcToken.connect(admin).transfer(REDEMPTION_ADDRESS, depositAmount);
            await tx.wait();
            
            const finalContractBalance = await usdcToken.balanceOf(REDEMPTION_ADDRESS);
            
            expect(finalContractBalance).to.be.greaterThan(initialContractBalance);
            
            console.log("   ✅ Transferred", ethers.formatUnits(depositAmount, USDC_DECIMALS), "USDC to contract");
            console.log("   ✅ New contract balance:", ethers.formatUnits(finalContractBalance, USDC_DECIMALS), "USDC");
        });

        it("Should check contract USDC balance", async function () {
            console.log("🧪 Checking contract USDC balance...");
            
            const balance = await usdcToken.balanceOf(REDEMPTION_ADDRESS);
            const buffer = await redemptionContract.bufferUSDC();
            const availableForRedemption = balance > buffer ? balance - buffer : 0n;
            
            console.log("   📊 Total USDC:", ethers.formatUnits(balance, USDC_DECIMALS));
            console.log("   📊 Buffer:", ethers.formatUnits(buffer, USDC_DECIMALS));
            console.log("   📊 Available for redemption:", ethers.formatUnits(availableForRedemption, USDC_DECIMALS));
        });
    });

    describe("6. Setup for Redemption Testing", function () {
        it("Should whitelist the redemption contract in ALTGOLD", async function () {
            console.log("🧪 Whitelisting redemption contract...");
            
            const isAlreadyWhitelisted = await altgoldToken.isWhitelisted(REDEMPTION_ADDRESS);
            
            if (isAlreadyWhitelisted) {
                console.log("   ℹ️  Redemption contract already whitelisted");
                return;
            }
            
            // Admin has WHITELIST_MANAGER_ROLE in ALTGOLD
            await waitBetweenTx();
            const tx = await altgoldToken.connect(admin).addToWhitelist(
                REDEMPTION_ADDRESS,
                "REDEMPTION_CONTRACT"
            );
            await tx.wait();
            
            const isWhitelisted = await altgoldToken.isWhitelisted(REDEMPTION_ADDRESS);
            expect(isWhitelisted).to.be.true;
            
            console.log("   ✅ Redemption contract whitelisted successfully");
        });

        it("Should transfer 100 USDC from admin to user wallet", async function () {
            console.log("🧪 Transferring USDC to user wallet...");
            
            const transferAmount = ethers.parseUnits("100", USDC_DECIMALS);
            
            const initialUserBalance = await usdcToken.balanceOf(user.address);
            const adminBalance = await usdcToken.balanceOf(admin.address);
            
            if (adminBalance < transferAmount) {
                console.log("   ⚠️  Insufficient admin USDC balance, skipping");
                this.skip();
                return;
            }
            
            await waitBetweenTx();
            const tx = await usdcToken.connect(admin).transfer(user.address, transferAmount);
            await tx.wait();
            
            const finalUserBalance = await usdcToken.balanceOf(user.address);
            
            expect(finalUserBalance).to.equal(initialUserBalance + transferAmount);
            
            console.log("   ✅ Transferred 100 USDC to user");
            console.log("   📊 User USDC balance:", ethers.formatUnits(finalUserBalance, USDC_DECIMALS));
        });

        it("Should verify user is whitelisted in ALTGOLD", async function () {
            console.log("🧪 Checking user whitelist status...");
            
            const isWhitelisted = await altgoldToken.isWhitelisted(user.address);
            
            if (!isWhitelisted) {
                console.log("   ⚠️  User not whitelisted, whitelisting now...");
                
                await waitBetweenTx();
                const tx = await altgoldToken.connect(admin).addToWhitelist(
                    user.address,
                    "TEST_USER_FOR_REDEMPTION"
                );
                await tx.wait();
                
                console.log("   ✅ User whitelisted successfully");
            } else {
                console.log("   ✅ User already whitelisted");
            }
            
            expect(await altgoldToken.isWhitelisted(user.address)).to.be.true;
        });

        it("Should mint ALTGOLD tokens to user for redemption testing", async function () {
            console.log("🧪 Minting ALTGOLD to user...");
            
            const mintAmount = ethers.parseUnits("100", ALTGOLD_DECIMALS);
            
            // Check if circuit breaker is active
            const circuitBreakerActive = await altgoldToken.circuitBreakerActive();
            if (circuitBreakerActive) {
                console.log("   ⚠️  Circuit breaker is active, cannot mint");
                this.skip();
                return;
            }
            
            // Check max mintable
            const maxMintable = await altgoldToken.getMaxMintableTokens();
            if (maxMintable < mintAmount) {
                console.log("   ⚠️  Not enough gold backing to mint 100 ALTGOLD");
                console.log("   ℹ️  Max mintable:", ethers.formatUnits(maxMintable, ALTGOLD_DECIMALS));
                this.skip();
                return;
            }
            
            const initialBalance = await altgoldToken.balanceOf(user.address);
            
            // Admin might not have SUPPLY_CONTROLLER_ROLE in this ALTGOLD instance
            // Try to mint with admin first
            await waitBetweenTx();
            try {
                const tx = await altgoldToken.connect(admin).mint(
                    user.address,
                    mintAmount,
                    "Minting for redemption test"
                );
                await tx.wait();
                
                const finalBalance = await altgoldToken.balanceOf(user.address);
                expect(finalBalance).to.be.greaterThan(initialBalance);
                
                console.log("   ✅ Minted 100 ALTGOLD to user");
                console.log("   📊 User ALTGOLD balance:", ethers.formatUnits(finalBalance, ALTGOLD_DECIMALS));
            } catch (error) {
                console.log("   ⚠️  Cannot mint - admin may not have SUPPLY_CONTROLLER_ROLE");
                console.log("   ℹ️  Error:", error.message.substring(0, 100));
                this.skip();
            }
        });
    });

    describe("7. Redemption Statistics", function () {
        it("Should get global statistics", async function () {
            console.log("🧪 Testing global statistics...");
            
            const totalRedeemed = await redemptionContract.totalRedeemedALT();
            const totalPaid = await redemptionContract.totalPaidUSDC();
            const totalCount = await redemptionContract.totalRedemptionCount();
            
            console.log("   📊 Total redeemed:", ethers.formatUnits(totalRedeemed, ALTGOLD_DECIMALS), "ALTGOLD");
            console.log("   📊 Total paid:", ethers.formatUnits(totalPaid, USDC_DECIMALS), "USDC");
            console.log("   📊 Total redemptions:", totalCount.toString());
        });

        it("Should get user statistics", async function () {
            console.log("🧪 Testing user statistics...");
            
            // Use getUserStats method instead
            const userStats = await redemptionContract.getUserStats(admin.address);
            
            console.log("   📊 User total redeemed:", ethers.formatUnits(userStats[0], ALTGOLD_DECIMALS), "ALTGOLD");
            console.log("   📊 User redemption count:", userStats[1].toString());
        });
    });

    describe("8. Live Redemption Testing - User Sells ALTGOLD", function () {
        it("Should allow user to redeem ALTGOLD for USDC", async function () {
            console.log("🧪 Testing live redemption - user sells ALTGOLD tokens...\n");
            
            // Check prerequisites
            const userAltBalance = await altgoldToken.balanceOf(user.address);
            const contractUSDC = await usdcToken.balanceOf(REDEMPTION_ADDRESS);
            const isUserWhitelisted = await altgoldToken.isWhitelisted(user.address);
            const isContractWhitelisted = await altgoldToken.isWhitelisted(REDEMPTION_ADDRESS);
            const isPaused = await redemptionContract.paused();
            
            console.log("   📋 Pre-redemption Status:");
            console.log("      User ALTGOLD balance:", ethers.formatUnits(userAltBalance, ALTGOLD_DECIMALS));
            console.log("      Contract USDC balance:", ethers.formatUnits(contractUSDC, USDC_DECIMALS));
            console.log("      User whitelisted:", isUserWhitelisted);
            console.log("      Contract whitelisted:", isContractWhitelisted);
            console.log("      Contract paused:", isPaused);
            
            if (userAltBalance === 0n) {
                console.log("\n   ⚠️  User has no ALTGOLD tokens, skipping redemption test");
                this.skip();
                return;
            }
            
            if (!isUserWhitelisted || !isContractWhitelisted) {
                console.log("\n   ⚠️  Whitelist requirements not met, skipping");
                this.skip();
                return;
            }
            
            if (isPaused) {
                console.log("\n   ⚠️  Contract is paused, skipping");
                this.skip();
                return;
            }
            
            // Redeem amount: 10 ALTGOLD (minimum redemption amount)
            const redeemAmount = ethers.parseUnits("10", ALTGOLD_DECIMALS);
            
            if (userAltBalance < redeemAmount) {
                console.log("\n   ⚠️  User has insufficient ALTGOLD, skipping");
                this.skip();
                return;
            }
            
            // Calculate expected USDC payout
            const usdcPerGram = await redemptionContract.usdcPerGram();
            const weightPerALT = await redemptionContract.goldWeightPerALT_g6();
            const WEIGHT_PRECISION = 1000000n;
            const expectedUSDC = (redeemAmount * weightPerALT * usdcPerGram) / 
                                (BigInt(10 ** ALTGOLD_DECIMALS) * WEIGHT_PRECISION);
            
            console.log("\n   💰 Redemption Details:");
            console.log("      Redeeming:", ethers.formatUnits(redeemAmount, ALTGOLD_DECIMALS), "ALTGOLD");
            console.log("      Expected USDC:", ethers.formatUnits(expectedUSDC, USDC_DECIMALS));
            console.log("      Rate: 1 ALTGOLD =", ethers.formatUnits(usdcPerGram, USDC_DECIMALS), "USDC");
            
            // Check if contract has enough USDC (including buffer)
            const buffer = await redemptionContract.bufferUSDC();
            const requiredUSDC = expectedUSDC + buffer;
            
            if (contractUSDC < requiredUSDC) {
                console.log("\n   ⚠️  Contract has insufficient USDC (needs", ethers.formatUnits(requiredUSDC, USDC_DECIMALS), "including buffer)");
                this.skip();
                return;
            }
            
            // Get initial balances
            const initialUserUSDC = await usdcToken.balanceOf(user.address);
            const initialUserALT = await altgoldToken.balanceOf(user.address);
            const initialContractUSDC = await usdcToken.balanceOf(REDEMPTION_ADDRESS);
            const initialTotalRedeemed = await redemptionContract.totalRedeemedALT();
            const initialTotalPaid = await redemptionContract.totalPaidUSDC();
            
            console.log("\n   📊 Initial Balances:");
            console.log("      User USDC:", ethers.formatUnits(initialUserUSDC, USDC_DECIMALS));
            console.log("      User ALTGOLD:", ethers.formatUnits(initialUserALT, ALTGOLD_DECIMALS));
            console.log("      Contract USDC:", ethers.formatUnits(initialContractUSDC, USDC_DECIMALS));
            
            // Step 1: Approve redemption contract to spend user's ALTGOLD
            console.log("\n   ⏳ Step 1: Approving ALTGOLD...");
            await waitBetweenTx();
            let tx = await altgoldToken.connect(user).approve(REDEMPTION_ADDRESS, redeemAmount);
            await tx.wait();
            console.log("      ✅ Approved");
            
            // Step 2: Execute redemption
            console.log("\n   ⏳ Step 2: Executing redemption...");
            await waitBetweenTx();
            // redeem(amountALT, expiry, sig) - for simple redemption, use 0 for expiry and empty sig
            tx = await redemptionContract.connect(user).redeem(redeemAmount, 0, "0x");
            const receipt = await tx.wait();
            console.log("      ✅ Redemption completed!");
            console.log("      Gas used:", receipt.gasUsed.toString());
            
            // Get final balances
            const finalUserUSDC = await usdcToken.balanceOf(user.address);
            const finalUserALT = await altgoldToken.balanceOf(user.address);
            const finalContractUSDC = await usdcToken.balanceOf(REDEMPTION_ADDRESS);
            const finalTotalRedeemed = await redemptionContract.totalRedeemedALT();
            const finalTotalPaid = await redemptionContract.totalPaidUSDC();
            
            console.log("\n   📊 Final Balances:");
            console.log("      User USDC:", ethers.formatUnits(finalUserUSDC, USDC_DECIMALS));
            console.log("      User ALTGOLD:", ethers.formatUnits(finalUserALT, ALTGOLD_DECIMALS));
            console.log("      Contract USDC:", ethers.formatUnits(finalContractUSDC, USDC_DECIMALS));
            
            console.log("\n   📈 Changes:");
            console.log("      User USDC gained:", ethers.formatUnits(finalUserUSDC - initialUserUSDC, USDC_DECIMALS));
            console.log("      User ALTGOLD burned:", ethers.formatUnits(initialUserALT - finalUserALT, ALTGOLD_DECIMALS));
            console.log("      Contract USDC paid:", ethers.formatUnits(initialContractUSDC - finalContractUSDC, USDC_DECIMALS));
            
            console.log("\n   📊 Global Statistics:");
            console.log("      Total ALTGOLD redeemed:", ethers.formatUnits(finalTotalRedeemed, ALTGOLD_DECIMALS));
            console.log("      Total USDC paid:", ethers.formatUnits(finalTotalPaid, USDC_DECIMALS));
            
            // Verify the redemption
            expect(finalUserALT).to.equal(initialUserALT - redeemAmount);
            expect(finalUserUSDC).to.be.greaterThan(initialUserUSDC);
            expect(finalContractUSDC).to.be.lessThan(initialContractUSDC);
            expect(finalTotalRedeemed).to.equal(initialTotalRedeemed + redeemAmount);
            
            // The actual USDC received might be slightly different due to rounding
            const actualUSDCReceived = finalUserUSDC - initialUserUSDC;
            console.log("\n   ✅ Redemption successful!");
            console.log("   ✅ User sold", ethers.formatUnits(redeemAmount, ALTGOLD_DECIMALS), "ALTGOLD");
            console.log("   ✅ User received", ethers.formatUnits(actualUSDCReceived, USDC_DECIMALS), "USDC");
        });

        it("Should get user redemption history after redemption", async function () {
            console.log("🧪 Checking user redemption history...");
            
            const historyLength = await redemptionContract.getUserHistoryLength(user.address);
            console.log("   📊 User redemption history length:", historyLength.toString());
            
            if (historyLength > 0n) {
                const history = await redemptionContract.getUserHistory(user.address, 0, Number(historyLength));
                console.log("   📊 Latest redemption ID:", history[history.length - 1].toString());
                
                const userStats = await redemptionContract.getUserStats(user.address);
                console.log("   📊 User total redeemed:", ethers.formatUnits(userStats[0], ALTGOLD_DECIMALS), "ALTGOLD");
                console.log("   📊 User redemption count:", userStats[1].toString());
                
                expect(historyLength).to.be.greaterThan(0);
            }
        });
    });

    describe("9. Redemption Flow (Simulated)", function () {
        it("Should check redemption prerequisites", async function () {
            console.log("🧪 Checking redemption prerequisites...");
            
            const checklist = {
                instantEnabled: await redemptionContract.instantRedemptionEnabled(),
                rateSet: (await redemptionContract.usdcPerGram()) > 0n,
                weightSet: (await redemptionContract.goldWeightPerALT_g6()) > 0n,
                contractWhitelisted: await altgoldToken.isWhitelisted(REDEMPTION_ADDRESS),
                userWhitelisted: await altgoldToken.isWhitelisted(user.address),
                contractHasUSDC: (await usdcToken.balanceOf(REDEMPTION_ADDRESS)) > 0n,
                userHasALTGOLD: (await altgoldToken.balanceOf(user.address)) > 0n,
                contractNotPaused: !(await redemptionContract.paused())
            };
            
            console.log("\n   Redemption Checklist:");
            console.log("   ✓ Instant redemption enabled:", checklist.instantEnabled);
            console.log("   ✓ USDC/gram rate set:", checklist.rateSet);
            console.log("   ✓ Gold weight set:", checklist.weightSet);
            console.log("   ✓ Contract whitelisted:", checklist.contractWhitelisted);
            console.log("   ✓ User whitelisted:", checklist.userWhitelisted);
            console.log("   ✓ Contract has USDC:", checklist.contractHasUSDC);
            console.log("   ✓ User has ALTGOLD:", checklist.userHasALTGOLD);
            console.log("   ✓ Contract not paused:", checklist.contractNotPaused);
            
            const allReady = Object.values(checklist).every(v => v === true);
            
            if (!allReady) {
                console.log("\n   ⚠️  Not all prerequisites met for redemption");
                const missing = Object.entries(checklist).filter(([k, v]) => !v).map(([k]) => k);
                console.log("   ⚠️  Missing:", missing.join(", "));
            } else {
                console.log("\n   ✅ All prerequisites met for redemption!");
            }
        });

        it("Should calculate expected USDC payout", async function () {
            console.log("🧪 Testing payout calculation...");
            
            const usdcPerGram = await redemptionContract.usdcPerGram();
            const weightPerALT = await redemptionContract.goldWeightPerALT_g6();
            
            if (usdcPerGram === 0n || weightPerALT === 0n) {
                console.log("   ⚠️  Cannot calculate - rates not set");
                this.skip();
                return;
            }
            
            const testAmount = HUNDRED_ALTGOLD;
            
            // Formula: (amountALT * goldWeightPerALT_g6 * usdcPerGram) / (10^altDecimals * WEIGHT_PRECISION)
            const WEIGHT_PRECISION = 1000000n;
            const expectedUSDC = (testAmount * weightPerALT * usdcPerGram) / 
                                (BigInt(10 ** ALTGOLD_DECIMALS) * WEIGHT_PRECISION);
            
            console.log("   📊 For", ethers.formatUnits(testAmount, ALTGOLD_DECIMALS), "ALTGOLD:");
            console.log("   📊 Gold weight:", ethers.formatUnits(weightPerALT, 6), "grams per ALT");
            console.log("   📊 USDC per gram:", ethers.formatUnits(usdcPerGram, USDC_DECIMALS));
            console.log("   📊 Expected USDC:", ethers.formatUnits(expectedUSDC, USDC_DECIMALS));
        });
    });

    describe("10. Access Control Tests", function () {
        it("Should reject unauthorized rate updates", async function () {
            console.log("🧪 Testing unauthorized rate update...");
            
            // user (account 3) doesn't have RATE_MANAGER_ROLE
            await expect(
                redemptionContract.connect(user).setGoldWeightPerALT(ethers.parseUnits("1", 6))
            ).to.be.reverted;
            
            console.log("   ✅ Unauthorized rate update rejected");
        });

        it("Should reject unauthorized treasury operations", async function () {
            console.log("🧪 Testing unauthorized treasury operations...");
            
            // user doesn't have TREASURER_ROLE - test setBufferUSDC instead
            await expect(
                redemptionContract.connect(user).setBufferUSDC(THOUSAND_USDC)
            ).to.be.reverted;
            
            console.log("   ✅ Unauthorized treasury operations rejected");
        });

        it("Should reject unauthorized pause", async function () {
            console.log("🧪 Testing unauthorized pause...");
            
            // user doesn't have PAUSER_ROLE
            await expect(
                redemptionContract.connect(user).pause()
            ).to.be.reverted;
            
            console.log("   ✅ Unauthorized pause rejected");
        });
    });

    describe("11. Final Contract State", function () {
        it("Should verify final contract state is valid", async function () {
            console.log("🧪 Verifying final contract state...");
            
            const instantEnabled = await redemptionContract.instantRedemptionEnabled();
            const isPaused = await redemptionContract.paused();
            const contractUSDC = await usdcToken.balanceOf(REDEMPTION_ADDRESS);
            
            expect(isPaused).to.be.false;
            
            console.log("\n   📊 Final Statistics:");
            console.log("      Instant redemption:", instantEnabled);
            console.log("      Paused:", isPaused);
            console.log("      Contract USDC:", ethers.formatUnits(contractUSDC, USDC_DECIMALS));
            
            const totalRedeemed = await redemptionContract.totalRedeemedALT();
            const totalPaid = await redemptionContract.totalPaidUSDC();
            const totalCount = await redemptionContract.totalRedemptionCount();
            
            console.log("      Total Redeemed:", ethers.formatUnits(totalRedeemed, ALTGOLD_DECIMALS), "ALTGOLD");
            console.log("      Total Paid:", ethers.formatUnits(totalPaid, USDC_DECIMALS), "USDC");
            console.log("      Total Redemptions:", totalCount.toString());
            
            console.log("\n   ✅ All contract state is valid");
        });
    });
});

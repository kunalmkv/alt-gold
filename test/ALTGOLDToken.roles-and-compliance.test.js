const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

/**
 * @title ALTGOLDToken Test Suite
 * @notice Tests ALTGOLDToken contract with multiple accounts using correct role permissions
 * @dev Uses the deployed contract address for testing with real contract calls
 */

describe("ALTGOLDToken Tests", function () {
    // Contract instances
    let altgoldToken;
    let altgoldTokenFactory;
    
    // Test accounts with their roles
    let admin;                  // Account 0 - Admin
    let supplyController;       // Account 1 - Supply Controller, Auditor, Reserve Manager
    let complianceManager;      // Account 2 - Whitelist Manager, Compliance Officer, Pauser
    let executor;               // Account 3 - Executor, Burner, Test User
    
    // Contract address
    const ALTGOLD_TOKEN_ADDRESS = process.env.ALTGOLD_TOKEN_ADDRESS || "0x6eDf5B5B53014e0249955142cE12026Cce055296";
    
    // Test constants
    const DECIMALS = 6;
    const ONE_TOKEN = ethers.parseUnits("1", DECIMALS);
    const TEN_TOKENS = ethers.parseUnits("10", DECIMALS);
    const HUNDRED_TOKENS = ethers.parseUnits("100", DECIMALS);
    const THOUSAND_TOKENS = ethers.parseUnits("1000", DECIMALS);
    const FIVE_HUNDRED_TOKENS = ethers.parseUnits("500", DECIMALS);
    
    // Role constants
    const SUPPLY_CONTROLLER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SUPPLY_CONTROLLER_ROLE"));
    const WHITELIST_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WHITELIST_MANAGER_ROLE"));
    const COMPLIANCE_OFFICER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_OFFICER_ROLE"));
    const AUDITOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE"));
    const RESERVE_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RESERVE_MANAGER_ROLE"));
    const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
    const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    
    // Helper function to wait between transactions
    const waitBetweenTx = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second
    };

    before(async function () {
        this.timeout(120000); // 2 minutes for setup
        console.log("🚀 Setting up ALTGOLDToken test environment...");
        
        // Get signers
        const signers = await ethers.getSigners();
        console.log("📊 Available signers:", signers.length);
        
        admin = signers[0];                    // Admin
        supplyController = signers[1];         // Supply/Auditor/Reserve
        complianceManager = signers[2];        // Whitelist/Compliance/Pauser
        executor = signers[3];                 // Executor/Burner/Test User
        
        console.log("\n👤 Test accounts:");
        console.log("   Admin:", admin.address);
        console.log("   Supply Controller:", supplyController.address);
        console.log("   Compliance Manager:", complianceManager.address);
        console.log("   Executor:", executor.address);
        
        // Get contract factory and attach to deployed contract
        altgoldTokenFactory = await ethers.getContractFactory("ALTGOLDToken");
        altgoldToken = altgoldTokenFactory.attach(ALTGOLD_TOKEN_ADDRESS);
        
        console.log("\n📋 Contract Details:");
        console.log("   Address:", ALTGOLD_TOKEN_ADDRESS);
        
        // Check if we're on the right network
        const network = await ethers.provider.getNetwork();
        console.log("   Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
        
        console.log("   Name:", await altgoldToken.name());
        console.log("   Symbol:", await altgoldToken.symbol());
        console.log("   Decimals:", await altgoldToken.decimals());
        console.log("   Version:", await altgoldToken.version());
        console.log("   Total Supply:", ethers.formatUnits(await altgoldToken.totalSupply(), DECIMALS));
        
        // ========= SETUP: Grant Roles and Whitelist Accounts =========
        console.log("\n🔧 Setting up roles and whitelisting...");
        
        // Check and grant roles if needed
        const rolesToGrant = [
            { role: SUPPLY_CONTROLLER_ROLE, account: supplyController, name: "SUPPLY_CONTROLLER" },
            { role: AUDITOR_ROLE, account: supplyController, name: "AUDITOR" },
            { role: RESERVE_MANAGER_ROLE, account: supplyController, name: "RESERVE_MANAGER" },
            { role: WHITELIST_MANAGER_ROLE, account: complianceManager, name: "WHITELIST_MANAGER" },
            { role: COMPLIANCE_OFFICER_ROLE, account: complianceManager, name: "COMPLIANCE_OFFICER" },
            { role: PAUSER_ROLE, account: complianceManager, name: "PAUSER" },
            { role: EXECUTOR_ROLE, account: executor, name: "EXECUTOR" },
            { role: BURNER_ROLE, account: executor, name: "BURNER" }
        ];
        
        for (const { role, account, name } of rolesToGrant) {
            const hasRole = await altgoldToken.hasRole(role, account.address);
            if (!hasRole) {
                console.log(`   ⏳ Granting ${name} to ${account.address}...`);
                await (await altgoldToken.grantRole(role, account.address)).wait();
                await waitBetweenTx();
                console.log(`   ✅ Granted ${name}`);
            } else {
                console.log(`   ✓ ${name} already granted to ${account.address}`);
            }
        }
        
        // Whitelist all test accounts if not already whitelisted
        const accountsToWhitelist = [
            { account: admin, name: "Admin" },
            { account: supplyController, name: "Supply Controller" },
            { account: complianceManager, name: "Compliance Manager" },
            { account: executor, name: "Executor" }
        ];
        
        for (const { account, name } of accountsToWhitelist) {
            const isWhitelisted = await altgoldToken.isWhitelisted(account.address);
            if (!isWhitelisted) {
                console.log(`   ⏳ Whitelisting ${name} (${account.address})...`);
                await (await altgoldToken.connect(complianceManager).addToWhitelist(account.address, `TEST_${name.toUpperCase().replace(' ', '_')}`)).wait();
                await waitBetweenTx();
                console.log(`   ✅ Whitelisted ${name}`);
            } else {
                console.log(`   ✓ ${name} already whitelisted`);
            }
        }
        
        console.log("✅ Setup complete - roles granted and accounts whitelisted!\n");
    });

    describe("1. Basic Contract Properties", function () {
        it("Should have correct basic properties", async function () {
            console.log("🧪 Testing basic contract properties...");
            
            expect(await altgoldToken.name()).to.equal("ALTGOLD Token");
            expect(await altgoldToken.symbol()).to.equal("ALTGOLD");
            expect(await altgoldToken.decimals()).to.equal(DECIMALS);
            expect(await altgoldToken.version()).to.equal("1.0.0");
            
            console.log("   ✅ All properties verified");
        });

        it("Should have admin with proper role", async function () {
            console.log("🧪 Testing admin role...");
            
            expect(await altgoldToken.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
            
            console.log("   ✅ Admin role confirmed");
        });
    });

    describe("2. Role Verification", function () {
        it("Should have correct roles assigned to all accounts", async function () {
            console.log("🧪 Verifying role assignments...");
            
            // Admin
            expect(await altgoldToken.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
            console.log("   ✅ Admin has DEFAULT_ADMIN_ROLE");
            
            // Supply Controller
            expect(await altgoldToken.hasRole(SUPPLY_CONTROLLER_ROLE, supplyController.address)).to.be.true;
            expect(await altgoldToken.hasRole(AUDITOR_ROLE, supplyController.address)).to.be.true;
            expect(await altgoldToken.hasRole(RESERVE_MANAGER_ROLE, supplyController.address)).to.be.true;
            console.log("   ✅ Supply Controller has Supply/Auditor/Reserve roles");
            
            // Compliance Manager
            expect(await altgoldToken.hasRole(WHITELIST_MANAGER_ROLE, complianceManager.address)).to.be.true;
            expect(await altgoldToken.hasRole(COMPLIANCE_OFFICER_ROLE, complianceManager.address)).to.be.true;
            expect(await altgoldToken.hasRole(PAUSER_ROLE, complianceManager.address)).to.be.true;
            console.log("   ✅ Compliance Manager has Whitelist/Compliance/Pauser roles");
            
            // Executor
            expect(await altgoldToken.hasRole(EXECUTOR_ROLE, executor.address)).to.be.true;
            expect(await altgoldToken.hasRole(BURNER_ROLE, executor.address)).to.be.true;
            console.log("   ✅ Executor has Executor/Burner roles");
        });
    });

    describe("3. Whitelist Management", function () {
        it("Should verify all accounts are whitelisted", async function () {
            console.log("🧪 Checking whitelist status...");
            
            expect(await altgoldToken.isWhitelisted(admin.address)).to.be.true;
            expect(await altgoldToken.isWhitelisted(supplyController.address)).to.be.true;
            expect(await altgoldToken.isWhitelisted(complianceManager.address)).to.be.true;
            expect(await altgoldToken.isWhitelisted(executor.address)).to.be.true;
            
            console.log("   ✅ All test accounts are whitelisted");
        });

        it("Should get whitelist statistics", async function () {
            console.log("🧪 Testing whitelist statistics...");
            
            const totalWhitelisted = await altgoldToken.getTotalWhitelisted();
            expect(totalWhitelisted).to.be.at.least(4); // At least 4 accounts should be whitelisted
            
            const whitelistedAddresses = await altgoldToken.getWhitelistedAddresses();
            expect(whitelistedAddresses.length).to.be.at.least(4);
            
            console.log("   ✅ Total whitelisted:", totalWhitelisted.toString());
        });
    });

    describe("4. Gold Reserve Management", function () {
        it("Should have gold reserves configured", async function () {
            console.log("🧪 Checking gold reserves...");
            
            const goldInfo = await altgoldToken.getGoldBackingInfo();
            
            expect(goldInfo.totalGrams).to.be.greaterThan(0);
            expect(goldInfo.tokenPerGram).to.be.greaterThan(0);
            expect(goldInfo.lastAuditor).to.not.equal(ethers.ZeroAddress);
            
            console.log("   ✅ Gold reserves:", ethers.formatUnits(goldInfo.totalGrams, DECIMALS), "grams @", ethers.formatUnits(goldInfo.tokenPerGram, DECIMALS), "tokens/gram");
        });

        it("Should calculate max mintable tokens correctly", async function () {
            console.log("🧪 Testing max mintable calculation...");
            
            const maxMintable = await altgoldToken.getMaxMintableTokens();
            
            expect(maxMintable).to.be.greaterThan(0);
            
            console.log("   ✅ Max mintable:", ethers.formatUnits(maxMintable, DECIMALS), "ALTGOLD");
        });
    });

    describe("5. Minting Functions", function () {
        it("Should allow supply controller to mint tokens", async function () {
            console.log("🧪 Testing token minting...");
            
            // Check if circuit breaker is active
            const circuitBreakerActive = await altgoldToken.circuitBreakerActive();
            
            if (circuitBreakerActive) {
                console.log("   ⚠️  Circuit breaker is active, skipping minting test");
                this.skip();
                return;
            }
            
            const mintAmount = FIVE_HUNDRED_TOKENS;
            const reason = "Test minting for executor";
            
            const initialBalance = await altgoldToken.balanceOf(executor.address);
            const initialTotalSupply = await altgoldToken.totalSupply();
            
            // supplyController has SUPPLY_CONTROLLER_ROLE
            await waitBetweenTx();
            const tx = await altgoldToken.connect(supplyController).mint(executor.address, mintAmount, reason);
            await tx.wait();
            await waitBetweenTx();
            
            const finalBalance = await altgoldToken.balanceOf(executor.address);
            const finalTotalSupply = await altgoldToken.totalSupply();
            
            expect(finalBalance).to.be.greaterThan(initialBalance);
            expect(finalTotalSupply).to.be.greaterThan(initialTotalSupply);
            
            console.log("   ✅ Minted", ethers.formatUnits(finalBalance - initialBalance, DECIMALS), "ALTGOLD to executor");
        });

        it("Should get current minting statistics", async function () {
            console.log("🧪 Testing minting statistics...");
            
            const stats = await altgoldToken.getCurrentMintingStats();
            
            // After minting, these should be greater than 0
            expect(stats.dailyMinted).to.be.greaterThan(0);
            
            console.log("   ✅ Daily minted:", ethers.formatUnits(stats.dailyMinted, DECIMALS));
        });
    });

    describe("6. Compliance Settings", function () {
        it("Should allow compliance officer to update settings", async function () {
            console.log("🧪 Testing compliance settings update...");
            
            const maxTransfer = ethers.parseUnits("5000", DECIMALS);
            const minHolding = ethers.parseUnits("50", DECIMALS);
            
            // complianceManager has COMPLIANCE_OFFICER_ROLE
            await waitBetweenTx();
            const tx = await altgoldToken.connect(complianceManager).updateComplianceSettings(
                true,
                maxTransfer,
                minHolding
            );
            await tx.wait();
            
            console.log("   ✅ Compliance settings updated");
            console.log("      Max Transfer: 5000 ALTGOLD");
            console.log("      Min Holding: 50 ALTGOLD");
        });
    });

    describe("7. Transfer Functions", function () {
        it("Should transfer tokens between whitelisted users", async function () {
            console.log("🧪 Testing token transfers...");
            
            // Get minimum holding requirement
            const minHolding = ethers.parseUnits("50", DECIMALS); // Set in compliance test
            const transferAmount = HUNDRED_TOKENS;
            
            const initialExecutorBalance = await altgoldToken.balanceOf(executor.address);
            const initialAdminBalance = await altgoldToken.balanceOf(admin.address);
            
            // Only transfer if executor has enough balance (including min holding requirement)
            const requiredBalance = transferAmount + minHolding;
            
            if (initialExecutorBalance >= requiredBalance) {
                await waitBetweenTx();
                const tx = await altgoldToken.connect(executor).transfer(admin.address, transferAmount);
                await tx.wait();
                
                const finalExecutorBalance = await altgoldToken.balanceOf(executor.address);
                const finalAdminBalance = await altgoldToken.balanceOf(admin.address);
                
                expect(finalExecutorBalance).to.be.lessThan(initialExecutorBalance);
                expect(finalAdminBalance).to.be.greaterThan(initialAdminBalance);
                
                console.log("   ✅ Transferred", ethers.formatUnits(transferAmount, DECIMALS), "ALTGOLD");
            } else {
                console.log("   ⚠️  Insufficient balance for transfer test (need", ethers.formatUnits(requiredBalance, DECIMALS), "have", ethers.formatUnits(initialExecutorBalance, DECIMALS), "), skipping");
                this.skip();
            }
        });

        it("Should approve and transferFrom", async function () {
            console.log("🧪 Testing approve and transferFrom...");
            
            // Get minimum holding requirement
            const minHolding = ethers.parseUnits("50", DECIMALS);
            const transferAmount = ethers.parseUnits("60", DECIMALS); // Above min holding
            const adminBalance = await altgoldToken.balanceOf(admin.address);
            
            // Need enough balance to transfer and still meet min holding
            const requiredBalance = transferAmount + minHolding;
            
            if (adminBalance >= requiredBalance) {
                // Admin approves executor to spend tokens
                await waitBetweenTx();
                let tx = await altgoldToken.connect(admin).approve(executor.address, transferAmount);
                await tx.wait();
                
                const allowance = await altgoldToken.allowance(admin.address, executor.address);
                expect(allowance).to.equal(transferAmount);
                
                // Executor transfers from admin to supplyController
                const initialSupplyBalance = await altgoldToken.balanceOf(supplyController.address);
                
                await waitBetweenTx();
                tx = await altgoldToken.connect(executor).transferFrom(
                    admin.address,
                    supplyController.address,
                    transferAmount
                );
                await tx.wait();
                
                const finalSupplyBalance = await altgoldToken.balanceOf(supplyController.address);
                
                expect(finalSupplyBalance).to.be.greaterThan(initialSupplyBalance);
                
                console.log("   ✅ TransferFrom successful");
            } else {
                console.log("   ⚠️  Insufficient admin balance for transferFrom test (need", ethers.formatUnits(requiredBalance, DECIMALS), "have", ethers.formatUnits(adminBalance, DECIMALS), "), skipping");
                this.skip();
            }
        });
    });

    describe("8. Burning Functions", function () {
        it("Should allow burner to burn tokens", async function () {
            console.log("🧪 Testing token burning...");
            
            const burnAmount = TEN_TOKENS;
            const supplyBalance = await altgoldToken.balanceOf(supplyController.address);
            
            if (supplyBalance >= burnAmount) {
                const initialBalance = supplyBalance;
                const initialTotalSupply = await altgoldToken.totalSupply();
                
                // executor has BURNER_ROLE
                await waitBetweenTx();
                const tx = await altgoldToken.connect(executor).burn(
                    supplyController.address,
                    burnAmount,
                    "Test burn"
                );
                await tx.wait();
                
                const finalBalance = await altgoldToken.balanceOf(supplyController.address);
                const finalTotalSupply = await altgoldToken.totalSupply();
                
                expect(finalBalance).to.be.lessThan(initialBalance);
                expect(finalTotalSupply).to.be.lessThan(initialTotalSupply);
                
                console.log("   ✅ Burned", ethers.formatUnits(burnAmount, DECIMALS), "ALTGOLD");
            } else {
                console.log("   ⚠️  Insufficient balance for burn test, skipping");
                this.skip();
            }
        });
    });

    describe("9. Pause and Unpause", function () {
        it("Should allow pauser to pause the contract", async function () {
            console.log("🧪 Testing contract pause...");
            
            const currentlyPaused = await altgoldToken.paused();
            
            if (!currentlyPaused) {
                // complianceManager has PAUSER_ROLE
                await waitBetweenTx();
                const tx = await altgoldToken.connect(complianceManager).pause("Test pause");
                await tx.wait();
                
                expect(await altgoldToken.paused()).to.be.true;
                
                console.log("   ✅ Contract paused");
            } else {
                console.log("   ℹ️  Contract already paused");
            }
        });

        it("Should reject transfers when paused", async function () {
            console.log("🧪 Testing transfers when paused...");
            
            const isPaused = await altgoldToken.paused();
            
            if (isPaused) {
                await expect(
                    altgoldToken.connect(executor).transfer(admin.address, ONE_TOKEN)
                ).to.be.reverted;
                
                console.log("   ✅ Transfers rejected when paused");
            } else {
                console.log("   ⚠️  Contract not paused, skipping test");
                this.skip();
            }
        });

        it("Should allow pauser to unpause the contract", async function () {
            console.log("🧪 Testing contract unpause...");
            
            const currentlyPaused = await altgoldToken.paused();
            
            if (currentlyPaused) {
                // complianceManager has PAUSER_ROLE
                await waitBetweenTx();
                const tx = await altgoldToken.connect(complianceManager).unpause("Test unpause");
                await tx.wait();
                
                expect(await altgoldToken.paused()).to.be.false;
                
                console.log("   ✅ Contract unpaused");
            } else {
                console.log("   ℹ️  Contract already unpaused");
            }
        });

        it("Should allow transfers after unpause", async function () {
            console.log("🧪 Testing transfers after unpause...");
            
            const isPaused = await altgoldToken.paused();
            const executorBalance = await altgoldToken.balanceOf(executor.address);
            
            if (!isPaused && executorBalance >= TEN_TOKENS) {
                const transferAmount = TEN_TOKENS;
                const initialBalance = executorBalance;
                
                await waitBetweenTx();
                const tx = await altgoldToken.connect(executor).transfer(admin.address, transferAmount);
                await tx.wait();
                
                const finalBalance = await altgoldToken.balanceOf(executor.address);
                expect(finalBalance).to.be.lessThan(initialBalance);
                
                console.log("   ✅ Transfers work after unpause");
            } else {
                console.log("   ⚠️  Contract paused or insufficient balance, skipping");
                this.skip();
            }
        });
    });

    describe("10. Statistics and View Functions", function () {
        it("Should get contract statistics", async function () {
            console.log("🧪 Testing contract statistics...");
            
            const stats = await altgoldToken.getStatistics();
            
            expect(stats.totalWhitelisted_).to.be.at.least(4); // At least 4 accounts
            expect(stats.isPaused_).to.be.false;
            
            console.log("   ✅ Total Supply:", ethers.formatUnits(stats.totalSupply_, DECIMALS));
            console.log("   ✅ Total Minted:", ethers.formatUnits(stats.totalMinted_, DECIMALS));
            console.log("   ✅ Total Whitelisted:", stats.totalWhitelisted_.toString());
        });

        it("Should get gold backing information", async function () {
            console.log("🧪 Testing gold backing info...");
            
            const goldInfo = await altgoldToken.getGoldBackingInfo();
            
            expect(goldInfo.totalGrams).to.be.greaterThan(0);
            expect(goldInfo.tokenPerGram).to.be.greaterThan(0);
            expect(goldInfo.lastAuditor).to.not.equal(ethers.ZeroAddress);
            
            console.log("   ✅ Total Grams:", ethers.formatUnits(goldInfo.totalGrams, DECIMALS));
            console.log("   ✅ Tokens per Gram:", ethers.formatUnits(goldInfo.tokenPerGram, DECIMALS));
        });
    });

    describe("11. Access Control Tests", function () {
        it("Should reject unauthorized minting", async function () {
            console.log("🧪 Testing unauthorized minting...");
            
            // complianceManager doesn't have SUPPLY_CONTROLLER_ROLE
            await expect(
                altgoldToken.connect(complianceManager).mint(
                    executor.address,
                    HUNDRED_TOKENS,
                    "Unauthorized"
                )
            ).to.be.reverted;
            
            console.log("   ✅ Unauthorized minting rejected");
        });

        it("Should reject unauthorized whitelist management", async function () {
            console.log("🧪 Testing unauthorized whitelist management...");
            
            // executor doesn't have WHITELIST_MANAGER_ROLE
            await expect(
                altgoldToken.connect(executor).addToWhitelist(
                    ethers.Wallet.createRandom().address,
                    "KYC_TEST"
                )
            ).to.be.reverted;
            
            console.log("   ✅ Unauthorized whitelist management rejected");
        });

        it("Should reject unauthorized gold reserve updates", async function () {
            console.log("🧪 Testing unauthorized gold reserve update...");
            
            // complianceManager doesn't have AUDITOR_ROLE
            await expect(
                altgoldToken.connect(complianceManager).updateGoldReserve(
                    ethers.parseUnits("1000", DECIMALS),
                    ethers.parseUnits("1.5", DECIMALS),
                    "UNAUTHORIZED"
                )
            ).to.be.reverted;
            
            console.log("   ✅ Unauthorized gold reserve update rejected");
        });
    });

    describe("12. Final Contract State", function () {
        it("Should verify final contract state is valid", async function () {
            console.log("🧪 Verifying final contract state...");
            
            // Basic properties
            expect(await altgoldToken.name()).to.equal("ALTGOLD Token");
            expect(await altgoldToken.symbol()).to.equal("ALTGOLD");
            expect(await altgoldToken.decimals()).to.equal(DECIMALS);
            
            // Contract not paused
            expect(await altgoldToken.paused()).to.be.false;
            
            // Gold reserves set
            const goldInfo = await altgoldToken.getGoldBackingInfo();
            expect(goldInfo.totalGrams).to.be.greaterThan(0);
            
            // Accounts whitelisted
            const totalWhitelisted = await altgoldToken.getTotalWhitelisted();
            expect(totalWhitelisted).to.be.at.least(4); // At least 4 accounts
            
            // Tokens may or may not be in circulation
            const totalSupply = await altgoldToken.totalSupply();
            
            console.log("\n   📊 Final Statistics:");
            console.log("      Total Supply:", ethers.formatUnits(totalSupply, DECIMALS), "ALTGOLD");
            console.log("      Total Whitelisted:", totalWhitelisted.toString());
            console.log("      Max Mintable:", ethers.formatUnits(goldInfo.maxMintable, DECIMALS), "ALTGOLD");
            console.log("      Gold Reserves:", ethers.formatUnits(goldInfo.totalGrams, DECIMALS), "grams");
            console.log("\n   ✅ All contract state is valid");
        });
    });
});
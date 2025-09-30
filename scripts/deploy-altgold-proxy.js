const { ethers, upgrades } = require("hardhat");

/**
 * @title ALTGOLD Token Proxy Deployment Script
 * @notice Properly deploys ALTGOLD Token with UUPS proxy pattern
 * @dev Uses OpenZeppelin upgrades plugin for correct proxy deployment
 */

async function main() {
    console.log("🚀 Starting ALTGOLD Token deployment with UUPS proxy...");
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    console.log("👤 Deploying with account:", deployer.address);
    
    // Check balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    console.log("🌐 Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
    
    if (balance < ethers.parseEther("0.01")) {
        console.log("⚠️  Warning: Low balance, deployment might fail");
    }
    
    console.log("\n📦 Deploying ALTGOLD Token with proxy...");
    console.log("⏳ This will deploy:");
    console.log("   1. Implementation contract");
    console.log("   2. Proxy contract");
    console.log("   3. Initialize the proxy");
    
    // Get contract factory
    const ALTGOLDToken = await ethers.getContractFactory("ALTGOLDToken");
    
    // Deploy with proxy (this handles everything automatically)
    const altgoldToken = await upgrades.deployProxy(
        ALTGOLDToken,
        [
            deployer.address,           // admin
            "ALTGOLD Token",           // name
            "ALTGOLD"                  // symbol
        ],
        {
            kind: 'uups',
            initializer: 'initialize',
            timeout: 0  // No timeout
        }
    );
    
    await altgoldToken.waitForDeployment();
    const proxyAddress = await altgoldToken.getAddress();
    console.log("✅ ALTGOLD Token Proxy deployed at:", proxyAddress);
    
    // Get implementation address
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("✅ Implementation contract at:", implementationAddress);
    
    // Get contract details
    console.log("\n📊 Verifying deployment...");
    const tokenName = await altgoldToken.name();
    const tokenSymbol = await altgoldToken.symbol();
    const tokenDecimals = await altgoldToken.decimals();
    const totalSupply = await altgoldToken.totalSupply();
    const version = await altgoldToken.version();
    
    console.log("📊 Contract Details:");
    console.log("   Name:", tokenName);
    console.log("   Symbol:", tokenSymbol);
    console.log("   Decimals:", tokenDecimals.toString());
    console.log("   Total Supply:", ethers.formatUnits(totalSupply, tokenDecimals), tokenSymbol);
    console.log("   Version:", version);
    
    // Test role assignments
    const adminRole = await altgoldToken.DEFAULT_ADMIN_ROLE();
    const hasAdminRole = await altgoldToken.hasRole(adminRole, deployer.address);
    console.log("   Deployer has Admin Role:", hasAdminRole);
    
    // Test minting limits
    const mintingLimits = await altgoldToken.mintingLimits();
    console.log("   Per Transaction Limit:", ethers.formatUnits(mintingLimits.perTransactionLimit, tokenDecimals), tokenSymbol);
    console.log("   Daily Limit:", ethers.formatUnits(mintingLimits.dailyLimit, tokenDecimals), tokenSymbol);
    console.log("   Weekly Limit:", ethers.formatUnits(mintingLimits.weeklyLimit, tokenDecimals), tokenSymbol);
    
    // Set initial gold reserves
    console.log("\n🔧 Setting up initial gold reserves...");
    try {
        const auditorRole = await altgoldToken.AUDITOR_ROLE();
        const hasAuditorRole = await altgoldToken.hasRole(auditorRole, deployer.address);
        
        if (hasAuditorRole) {
            console.log("⏳ Updating gold reserve...");
            const tx = await altgoldToken.updateGoldReserve(
                ethers.parseUnits("1000", 6),      // 1000 grams of gold
                ethers.parseUnits("1.5", 6),       // 1.5 tokens per gram
                "INITIAL_AUDIT_REFERENCE"          // audit reference
            );
            await tx.wait();
            console.log("✅ Initial gold reserves set: 1000 grams, 1.5 tokens per gram");
            
            const maxMintable = await altgoldToken.getMaxMintableTokens();
            console.log("   Max Mintable:", ethers.formatUnits(maxMintable, tokenDecimals), tokenSymbol);
        }
    } catch (error) {
        console.log("⚠️  Failed to set gold reserves:", error.message);
    }
    
    // Set compliance settings
    console.log("\n🔧 Setting up compliance settings...");
    try {
        const complianceRole = await altgoldToken.COMPLIANCE_OFFICER_ROLE();
        const hasComplianceRole = await altgoldToken.hasRole(complianceRole, deployer.address);
        
        if (hasComplianceRole) {
            console.log("⏳ Updating compliance settings...");
            const decimals = Number(tokenDecimals);
            const tx = await altgoldToken.updateComplianceSettings(
                true,                               // compliance mode enabled
                ethers.parseUnits("10000", decimals), // max transfer: 10k tokens
                ethers.parseUnits("100", decimals)    // min holding: 100 tokens
            );
            await tx.wait();
            console.log("✅ Compliance settings configured");
            console.log("   Compliance Mode: Enabled");
            console.log("   Max Transfer: 10000", tokenSymbol);
            console.log("   Min Holding: 100", tokenSymbol);
        }
    } catch (error) {
        console.log("⚠️  Failed to set compliance settings:", error.message);
    }
    
    console.log("\n🌐 Etherscan Links:");
    const explorerBase = network.chainId === 11155111n ? "https://sepolia.etherscan.io" : "https://etherscan.io";
    console.log("   Proxy Contract:", `${explorerBase}/address/${proxyAddress}`);
    console.log("   Proxy Code:", `${explorerBase}/address/${proxyAddress}#code`);
    console.log("   Proxy Read:", `${explorerBase}/address/${proxyAddress}#readContract`);
    console.log("   Proxy Write:", `${explorerBase}/address/${proxyAddress}#writeContract`);
    console.log("   Implementation:", `${explorerBase}/address/${implementationAddress}`);
    console.log("   Implementation Code:", `${explorerBase}/address/${implementationAddress}#code`);
    
    // Save deployment info
    const deploymentInfo = {
        timestamp: new Date().toISOString(),
        network: network.name,
        chainId: network.chainId.toString(),
        deployer: deployer.address,
        proxyAddress: proxyAddress,
        implementationAddress: implementationAddress,
        tokenDetails: {
            name: tokenName,
            symbol: tokenSymbol,
            decimals: tokenDecimals.toString(),
            version: version
        }
    };
    
    console.log("\n💾 Deployment Summary:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    
    console.log("\n✅ ALTGOLD Token deployment completed successfully!");
    console.log("\n📋 Important Notes:");
    console.log("1. Use the PROXY address for all interactions:", proxyAddress);
    console.log("2. The implementation address is for reference only");
    console.log("3. Verify the proxy contract on Etherscan");
    console.log("4. Deploy Redemption contract next");
    
    console.log("\n📋 Next Steps:");
    console.log("1. Verify proxy on Etherscan: npm run verify:altgold:sepolia", proxyAddress);
    console.log("2. Deploy Redemption contract");
    console.log("3. Test token minting and transfers");
    
    return deploymentInfo;
}

// Handle errors
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });

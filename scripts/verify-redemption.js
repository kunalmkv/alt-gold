const { ethers } = require("hardhat");

/**
 * @title ALTGOLD Redemption Verification Script
 * @notice Verifies ALTGOLDRedemption contract on Etherscan
 */

async function main() {
    console.log("🔍 ALTGOLD Redemption Verification Script");
    console.log("=".repeat(40));
    
    // Get contract address from environment or command line
    const redemptionAddress = process.env.REDEMPTION_ADDRESS || process.argv[2];
    
    if (!redemptionAddress) {
        console.error("❌ Missing Redemption contract address!");
        console.log("Usage: npx hardhat run scripts/verify-redemption.js --network sepolia <REDEMPTION_ADDRESS>");
        console.log("Or set environment variable: REDEMPTION_ADDRESS");
        process.exit(1);
    }
    
    console.log("📍 Redemption Contract Address:", redemptionAddress);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    console.log("🌐 Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
    
    console.log("\n🔄 Starting verification process...");
    
    // Verify Redemption Contract
    console.log("\n📝 Verifying Redemption Contract...");
    try {
        await hre.run("verify:verify", {
            address: redemptionAddress,
            constructorArguments: [], // No constructor arguments for proxy
            contract: "contracts/redemption.sol:ALTGOLDRedemption"
        });
        
        console.log("✅ Redemption Contract verified successfully!");
    } catch (error) {
        if (error.message.includes("Already Verified")) {
            console.log("ℹ️  Redemption Contract already verified");
        } else {
            console.error("❌ Redemption Contract verification failed:", error.message);
        }
    }
    
    // Test contract functions
    console.log("\n🧪 Testing contract functions...");
    try {
        const ALTGOLDRedemption = await ethers.getContractFactory("ALTGOLDRedemption");
        const redemptionContract = ALTGOLDRedemption.attach(redemptionAddress);
        
        console.log("   ✅ Contract is accessible and working:");
        console.log("      Version:", await redemptionContract.VERSION());
        console.log("      ALTGOLD Token:", await redemptionContract.altgold());
        console.log("      USDC Token:", await redemptionContract.usdc());
        console.log("      Gold Weight per ALTGOLD:", ethers.formatUnits(await redemptionContract.goldWeightPerALT_g6(), 6), "grams");
        console.log("      USDC per Gram:", ethers.formatUnits(await redemptionContract.usdcPerGram(), 6), "USDC");
        console.log("      Instant Redemption Enabled:", await redemptionContract.instantRedemptionEnabled());
        
    } catch (error) {
        console.error("❌ Contract function testing failed:", error.message);
    }
    
    // Etherscan links
    console.log("\n🌐 Etherscan Links:");
    const explorerBase = network.chainId === 11155111n ? "https://sepolia.etherscan.io" : "https://etherscan.io";
    console.log("   Contract:", `${explorerBase}/address/${redemptionAddress}`);
    console.log("   Code:", `${explorerBase}/address/${redemptionAddress}#code`);
    console.log("   Read:", `${explorerBase}/address/${redemptionAddress}#readContract`);
    console.log("   Write:", `${explorerBase}/address/${redemptionAddress}#writeContract`);
    
    console.log("\n🎉 Verification completed!");
}

// Handle errors
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Verification failed:", error);
        process.exit(1);
    });

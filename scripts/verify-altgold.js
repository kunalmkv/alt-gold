const { ethers } = require("hardhat");

/**
 * @title ALTGOLD Token Verification Script
 * @notice Verifies ALTGOLDToken contract on Etherscan
 */

async function main() {
    console.log("🔍 ALTGOLD Token Verification Script");
    console.log("=".repeat(40));
    
    // Get contract address from environment or command line
    const altgoldTokenAddress = process.env.ALTGOLD_TOKEN_ADDRESS || process.argv[2];
    
    if (!altgoldTokenAddress) {
        console.error("❌ Missing ALTGOLD Token address!");
        console.log("Usage: npx hardhat run scripts/verify-altgold.js --network sepolia <ALTGOLD_TOKEN_ADDRESS>");
        console.log("Or set environment variable: ALTGOLD_TOKEN_ADDRESS");
        process.exit(1);
    }
    
    console.log("📍 ALTGOLD Token Address:", altgoldTokenAddress);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    console.log("🌐 Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
    
    console.log("\n🔄 Starting verification process...");
    
    // Verify ALTGOLD Token
    console.log("\n📝 Verifying ALTGOLD Token...");
    try {
        await hre.run("verify:verify", {
            address: altgoldTokenAddress,
            constructorArguments: [], // No constructor arguments for proxy
            contract: "contracts/ALTGOLDToken.sol:ALTGOLDToken"
        });
        
        console.log("✅ ALTGOLD Token verified successfully!");
    } catch (error) {
        if (error.message.includes("Already Verified")) {
            console.log("ℹ️  ALTGOLD Token already verified");
        } else {
            console.error("❌ ALTGOLD Token verification failed:", error.message);
        }
    }
    
    // Test contract functions
    console.log("\n🧪 Testing contract functions...");
    try {
        const ALTGOLDToken = await ethers.getContractFactory("ALTGOLDToken");
        const altgoldToken = ALTGOLDToken.attach(altgoldTokenAddress);
        
        console.log("   ✅ Contract is accessible and working:");
        console.log("      Name:", await altgoldToken.name());
        console.log("      Symbol:", await altgoldToken.symbol());
        console.log("      Decimals:", (await altgoldToken.decimals()).toString());
        console.log("      Version:", await altgoldToken.version());
        console.log("      Total Supply:", ethers.formatUnits(await altgoldToken.totalSupply(), await altgoldToken.decimals()));
        
    } catch (error) {
        console.error("❌ Contract function testing failed:", error.message);
    }
    
    // Etherscan links
    console.log("\n🌐 Etherscan Links:");
    const explorerBase = network.chainId === 11155111n ? "https://sepolia.etherscan.io" : "https://etherscan.io";
    console.log("   Contract:", `${explorerBase}/address/${altgoldTokenAddress}`);
    console.log("   Code:", `${explorerBase}/address/${altgoldTokenAddress}#code`);
    console.log("   Read:", `${explorerBase}/address/${altgoldTokenAddress}#readContract`);
    console.log("   Write:", `${explorerBase}/address/${altgoldTokenAddress}#writeContract`);
    
    console.log("\n🎉 Verification completed!");
}

// Handle errors
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Verification failed:", error);
        process.exit(1);
    });

const { ethers } = require("hardhat");

async function main() {
    const REDEMPTION_ADDRESS = "0x88b2DF0C0fFd9eE80e2e230dEA71e324Ac4f9049";
    
    const redemption = await ethers.getContractAt("ALTGOLDRedemption", REDEMPTION_ADDRESS);
    
    console.log("📊 Redemption Contract Properties:");
    
    // Check all public properties
    try {
        const minRedemption = await redemption.minRedemptionAmount();
        console.log("   Min redemption:", ethers.formatUnits(minRedemption, 6), "ALTGOLD");
    } catch (e) {
        console.log("   Min redemption: Property not found");
    }
    
    try {
        const maxRedemption = await redemption.maxRedemptionAmount();
        console.log("   Max redemption:", ethers.formatUnits(maxRedemption, 6), "ALTGOLD");
    } catch (e) {
        console.log("   Max redemption: Property not found");
    }
    
    // Check if these are state variables instead
    try {
        const minRedemption = redemption.minRedemptionAmount;
        console.log("   Min redemption (state var):", ethers.formatUnits(minRedemption, 6), "ALTGOLD");
    } catch (e) {
        console.log("   Min redemption (state var): Not accessible");
    }
    
    try {
        const maxRedemption = redemption.maxRedemptionAmount;
        console.log("   Max redemption (state var):", ethers.formatUnits(maxRedemption, 6), "ALTGOLD");
    } catch (e) {
        console.log("   Max redemption (state var): Not accessible");
    }
}

main().then(() => process.exit(0)).catch(console.error);

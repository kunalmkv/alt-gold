const { ethers } = require("hardhat");

async function main() {
    const ALTGOLD_ADDRESS = "0x6eDf5B5B53014e0249955142cE12026Cce055296";
    const REDEMPTION_ADDRESS = "0x88b2DF0C0fFd9eE80e2e230dEA71e324Ac4f9049";
    
    const altgoldToken = await ethers.getContractAt("ALTGOLDToken", ALTGOLD_ADDRESS);
    
    const SUPPLY_CONTROLLER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SUPPLY_CONTROLLER_ROLE"));
    const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
    
    console.log("📊 Redemption Contract Roles in ALTGOLD:");
    
    const hasSupplyController = await altgoldToken.hasRole(SUPPLY_CONTROLLER_ROLE, REDEMPTION_ADDRESS);
    const hasBurner = await altgoldToken.hasRole(BURNER_ROLE, REDEMPTION_ADDRESS);
    
    console.log("   SUPPLY_CONTROLLER_ROLE:", hasSupplyController ? "✅" : "❌");
    console.log("   BURNER_ROLE:", hasBurner ? "✅" : "❌");
    
    if (!hasSupplyController && !hasBurner) {
        console.log("\n💡 Need to grant BURNER_ROLE to redemption contract");
        
        const [admin] = await ethers.getSigners();
        console.log("⏳ Granting BURNER_ROLE to redemption contract...");
        
        const tx = await altgoldToken.connect(admin).grantRole(BURNER_ROLE, REDEMPTION_ADDRESS);
        await tx.wait();
        
        console.log("✅ BURNER_ROLE granted!");
        
        // Verify
        const hasBurnerNow = await altgoldToken.hasRole(BURNER_ROLE, REDEMPTION_ADDRESS);
        console.log("   BURNER_ROLE now:", hasBurnerNow ? "✅" : "❌");
    }
}

main().then(() => process.exit(0)).catch(console.error);

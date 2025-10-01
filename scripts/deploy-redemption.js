require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  console.log("\n🔧 Deploying ALTGOLDRedemption (Simple)...");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("👤 Deployer:", deployer.address);
  console.log("🌐 Network:", network.name, "(chainId:", network.chainId.toString() + ")");

  // Deploy Redemption contract
  const F = await ethers.getContractFactory("ALTGOLDRedemption");
  const c = await F.deploy();
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log("✅ Deployed ALTGOLDRedemption:", addr);

  console.log("\n📄 Set REDEMPTION_ADDRESS in .env to:", addr);
  console.log("\n🌐 Etherscan:");
  const base = "https://sepolia.etherscan.io/address/" + addr;
  console.log(" - Contract:", base);
  console.log(" - Code:", base + "#code");
  console.log(" - Read:", base + "#readContract");
  console.log(" - Write:", base + "#writeContract");
  
  console.log("\n⚠️  Note: Contract is deployed but not initialized yet.");
  console.log("   You can initialize it later via the contract's initialize function.");
}

main().catch(console.error);

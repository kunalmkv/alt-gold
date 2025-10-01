require("dotenv").config();
const hre = require("hardhat");
const { ethers, upgrades } = hre;

async function main() {
  console.log("\n🚀 Deploying ALTGOLDRedemption with UUPS Proxy...");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("🌐 Network:", network.name, "(chainId:", network.chainId.toString() + ")");

  const ALT = process.env.ALTGOLD_TOKEN_ADDRESS;
  const USDC = process.env.MOCK_USDC_ADDRESS;
  if (!ALT) throw new Error("ALTGOLD_TOKEN_ADDRESS missing");
  if (!USDC) throw new Error("MOCK_USDC_ADDRESS missing");

  // Deploy mock aggregators
  console.log("\n⏳ Deploying MockAggregator for XAU/USD...");
  const MockAgg = await ethers.getContractFactory("MockAggregator");
  const mockXAU = await MockAgg.deploy(8n, 2400n * 10n ** 8n);
  await mockXAU.waitForDeployment();
  const xauUsdFeed = await mockXAU.getAddress();
  console.log("✅ Mock XAU/USD feed:", xauUsdFeed);

  console.log("⏳ Deploying MockAggregator for USDC/USD...");
  const mockUSDC = await MockAgg.deploy(8n, 1n * 10n ** 8n);
  await mockUSDC.waitForDeployment();
  const usdcUsdFeed = await mockUSDC.getAddress();
  console.log("✅ Mock USDC/USD feed:", usdcUsdFeed);

  // Deploy with proxy
  console.log("\n📦 Deploying ALTGOLD Redemption with proxy...");
  const ALTGOLDRedemption = await ethers.getContractFactory("ALTGOLDRedemption");
  
  const redemption = await upgrades.deployProxy(
    ALTGOLDRedemption,
    [
      deployer.address,              // admin
      ALT,                           // altgoldToken
      USDC,                          // usdcToken
      ethers.parseUnits("1", 6),     // initialGoldWeightPerALT_g6
      xauUsdFeed,                    // xauUsdFeed
      usdcUsdFeed,                   // usdcUsdFeed
      3600,                          // stalenessThreshold (1 hour)
      1000,                          // maxDevBps (10%)
      ethers.parseUnits("30", 6),    // minUPG
      ethers.parseUnits("200", 6)    // maxUPG
    ],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["constructor"],
    }
  );

  await redemption.waitForDeployment();
  const proxyAddr = await redemption.getAddress();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddr);

  console.log("✅ Redemption Proxy deployed:", proxyAddr);
  console.log("✅ Implementation:", implAddr);

  // Verify configuration
  console.log("\n📊 Configuration:");
  const version = await redemption.VERSION();
  const altgoldAddr = await redemption.altgold();
  const usdcAddr = await redemption.usdc();
  const weight = await redemption.goldWeightPerALT_g6();
  
  console.log("   Version:", version);
  console.log("   ALTGOLD Token:", altgoldAddr);
  console.log("   USDC Token:", usdcAddr);
  console.log("   Gold Weight per ALTGOLD:", ethers.formatUnits(weight, 6), "grams");

  console.log("\n🌐 Etherscan:");
  const base = "https://sepolia.etherscan.io/address/" + proxyAddr;
  console.log(" - Proxy:", base);
  console.log(" - Code:", base + "#code");
  console.log(" - Implementation:", "https://sepolia.etherscan.io/address/" + implAddr + "#code");

  console.log("\n✅ Deployment complete!");
  console.log("\n📋 Update .env:");
  console.log("   REDEMPTION_ADDRESS=" + proxyAddr);
  console.log("\n📋 Mock Oracle Feeds:");
  console.log("   XAU_USD_FEED=" + xauUsdFeed);
  console.log("   USDC_USD_FEED=" + usdcUsdFeed);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

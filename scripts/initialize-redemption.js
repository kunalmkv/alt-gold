require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  console.log("\n🔧 Initializing ALTGOLDRedemption...");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("👤 Deployer:", deployer.address);
  console.log("🌐 Network:", network.name, "(chainId:", network.chainId.toString() + ")");

  const REDEMPTION_ADDR = process.env.REDEMPTION_ADDRESS;
  const ALT = process.env.ALTGOLD_TOKEN_ADDRESS;
  const USDC = process.env.MOCK_USDC_ADDRESS;

  if (!REDEMPTION_ADDR) throw new Error("REDEMPTION_ADDRESS missing in .env");
  if (!ALT) throw new Error("ALTGOLD_TOKEN_ADDRESS missing in .env");
  if (!USDC) throw new Error("MOCK_USDC_ADDRESS missing in .env");

  console.log("📍 Addresses:");
  console.log("   Redemption:", REDEMPTION_ADDR);
  console.log("   ALTGOLD:", ALT);
  console.log("   USDC:", USDC);

  // Deploy mock aggregators
  console.log("\n⏳ Deploying MockAggregator for XAU/USD...");
  const MockAgg = await ethers.getContractFactory("MockAggregator");
  const mockXAU = await MockAgg.deploy(8n, 2400n * 10n ** 8n); // 8 decimals, $2400/oz
  await mockXAU.waitForDeployment();
  const xauUsdFeed = await mockXAU.getAddress();
  console.log("✅ Mock XAU/USD feed:", xauUsdFeed);

  console.log("⏳ Deploying MockAggregator for USDC/USD...");
  const mockUSDC = await MockAgg.deploy(8n, 1n * 10n ** 8n); // 8 decimals, $1.00
  await mockUSDC.waitForDeployment();
  const usdcUsdFeed = await mockUSDC.getAddress();
  console.log("✅ Mock USDC/USD feed:", usdcUsdFeed);

  // Get Redemption contract
  const redemption = await ethers.getContractAt("ALTGOLDRedemption", REDEMPTION_ADDR);

  // Initialize params
  const initialGoldWeightPerALT_g6 = ethers.parseUnits("1", 6);
  const stalenessThreshold = 60 * 60; // 1 hour
  const maxDevBps = 1000; // 10%
  const minUPG = ethers.parseUnits("30", 6); // sanity floor
  const maxUPG = ethers.parseUnits("200", 6); // sanity cap

  console.log("\n⏳ Initializing Redemption contract...");
  const tx = await redemption.initialize(
    deployer.address,
    ALT,
    USDC,
    initialGoldWeightPerALT_g6,
    xauUsdFeed,
    usdcUsdFeed,
    stalenessThreshold,
    maxDevBps,
    minUPG,
    maxUPG
  );
  
  console.log("   Transaction hash:", tx.hash);
  await tx.wait();
  console.log("✅ Initialized successfully!");

  // Post-init configuration
  console.log("\n⏳ Configuring redemption settings...");
  
  await (await redemption.setRateValidityPeriod(24 * 60 * 60)).wait();
  console.log("✅ Set rate validity period: 24 hours");
  
  await (await redemption.setRedemptionSettings(true, false)).wait();
  console.log("✅ Set redemption settings: instant=true, compliance=false");
  
  await (await redemption.updateLimits(
    ethers.parseUnits("10", 6),      // min: 10 ALTGOLD
    ethers.parseUnits("10000", 6),   // max: 10,000 ALTGOLD
    ethers.parseUnits("1000000", 6), // global daily: 1M USDC
    ethers.parseUnits("50000", 6),   // user daily: 50K USDC
    3600                             // cooldown: 1 hour
  )).wait();
  console.log("✅ Set limits");
  
  await (await redemption.setBuffer(ethers.parseUnits("100000", 6))).wait();
  console.log("✅ Set buffer: 100,000 USDC");
  
  await (await redemption.setReserveRequirementBps(0)).wait();
  console.log("✅ Set reserve requirement: 0 (disabled)");
  
  await (await redemption.setProcessingWindow(false, 0, 24)).wait();
  console.log("✅ Set processing window: disabled (24/7)");

  // Verify configuration
  console.log("\n📊 Final Configuration:");
  const version = await redemption.VERSION();
  const altgoldAddr = await redemption.altgold();
  const usdcAddr = await redemption.usdc();
  const weight = await redemption.goldWeightPerALT_g6();
  const upg = await redemption.usdcPerGram();
  const instantEnabled = await redemption.instantRedemptionEnabled();
  
  console.log("   Version:", version);
  console.log("   ALTGOLD Token:", altgoldAddr);
  console.log("   USDC Token:", usdcAddr);
  console.log("   Gold Weight per ALTGOLD:", ethers.formatUnits(weight, 6), "grams");
  console.log("   USDC per Gram:", ethers.formatUnits(upg, 6), "USDC");
  console.log("   Instant Redemption:", instantEnabled);
  console.log("   XAU/USD Feed:", xauUsdFeed);
  console.log("   USDC/USD Feed:", usdcUsdFeed);

  console.log("\n🎉 Redemption contract fully initialized and configured!");
  console.log("\n📋 Mock Oracle Feeds (save these if needed):");
  console.log("   XAU/USD:", xauUsdFeed);
  console.log("   USDC/USD:", usdcUsdFeed);
}

main().catch((e) => {
  console.error("❌ Initialization failed:", e);
  process.exit(1);
});

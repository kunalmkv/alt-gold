#!/usr/bin/env node
/*
Unified Redemption Ops Script

Commands:
  node scripts/redemption-ops.js deploy             # Deploy and initialize redemption
  node scripts/redemption-ops.js whitelist          # Whitelist redemption in ALTGOLD
  node scripts/redemption-ops.js grant-roles        # Grant BURNER_ROLE in ALTGOLD to redemption
  node scripts/redemption-ops.js fund-usdc [amount] # Fund redemption with USDC (default: 200000)
  node scripts/redemption-ops.js fund-alt [amount]  # Fund redemption with ALTGOLD (default: min holding)
  node scripts/redemption-ops.js fix-rates          # Set USDC per gram and refresh rateUpdatedAt
  node scripts/redemption-ops.js show-status        # Show key state, limits, and readiness

Environment:
  Reads .env for:
    ALTGOLD_TOKEN_ADDRESS, REDEMPTION_ADDRESS, MOCK_USDC_ADDRESS

Notes:
  - Uses ethers v6 via Hardhat runtime.
  - Amount units: ALTGOLD 6 decimals, USDC 6 decimals.
*/

const { ethers } = require("hardhat");

async function getEnv() {
  const ALTGOLD = process.env.ALTGOLD_TOKEN_ADDRESS;
  const REDEEM = process.env.REDEMPTION_ADDRESS;
  const USDC = process.env.MOCK_USDC_ADDRESS;
  if (!ALTGOLD) throw new Error("ALTGOLD_TOKEN_ADDRESS missing in .env");
  if (!USDC) throw new Error("MOCK_USDC_ADDRESS missing in .env");
  return { ALTGOLD, REDEEM, USDC };
}

async function getContracts(env) {
  const altgold = await ethers.getContractAt("ALTGOLDToken", env.ALTGOLD);
  const redemption = env.REDEEM ? await ethers.getContractAt("ALTGOLDRedemption", env.REDEEM) : null;
  const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)", "function decimals() view returns (uint8)"];
  const usdc = new ethers.Contract(env.USDC, erc20Abi, (await ethers.getSigners())[0]);
  return { altgold, redemption, usdc };
}

async function wait(ms=3000) { return new Promise(r=>setTimeout(r, ms)); }

async function deploy() {
  const env = await getEnv();
  const [admin, a1, a2, a3] = await ethers.getSigners();
  console.log("\n⏳ Deploying ALTGOLDRedemption...");
  const F = await ethers.getContractFactory("ALTGOLDRedemption");
  const c = await F.deploy();
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log("✅ Deployed:", addr);

  // Initialize like working setup
  const initialGoldWeightPerALT_g6 = ethers.parseUnits("1", 6);
  const initialUSDCPerGram = ethers.parseUnits("65", 6);
  const initialRateValidityPeriod = 24 * 60 * 60;
  const enableInstantRedemption = true;
  const requireComplianceSig = false;
  const initialGlobalDailyLimitUSDC = ethers.parseUnits("1000000", 6);
  const initialUserDailyLimitUSDC = ethers.parseUnits("50000", 6);
  const initialCooldownSeconds = 3600;
  const initialBufferUSDC = ethers.parseUnits("100000", 6);
  const initialReserveRequirementBps = 10000;
  const initialWindow = { enabled: false, startHour: 0, endHour: 24 };

  console.log("⏳ Initializing...");
  await (await c.initialize(
    admin.address,
    env.ALTGOLD,
    env.USDC,
    initialGoldWeightPerALT_g6,
    initialUSDCPerGram,
    initialRateValidityPeriod,
    enableInstantRedemption,
    requireComplianceSig,
    initialGlobalDailyLimitUSDC,
    initialUserDailyLimitUSDC,
    initialCooldownSeconds,
    initialBufferUSDC,
    initialReserveRequirementBps,
    initialWindow
  )).wait();
  console.log("✅ Initialized");

  // Assign roles
  console.log("⏳ Assigning roles...");
  const COMPLIANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_ROLE"));
  const RATE_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RATE_MANAGER_ROLE"));
  const TREASURER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TREASURER_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const EMERGENCY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EMERGENCY_ROLE"));
  await wait(); await (await c.grantRole(RATE_MANAGER_ROLE, a1.address)).wait();
  await wait(); await (await c.grantRole(TREASURER_ROLE, a1.address)).wait();
  await wait(); await (await c.grantRole(COMPLIANCE_ROLE, a2.address)).wait();
  await wait(); await (await c.grantRole(PAUSER_ROLE, a2.address)).wait();
  await wait(); await (await c.grantRole(EMERGENCY_ROLE, a3.address)).wait();
  console.log("✅ Roles assigned");

  console.log("\nUpdate .env: REDEMPTION_ADDRESS=" + addr);
}

async function whitelist() {
  const env = await getEnv();
  if (!env.REDEEM) throw new Error("REDEMPTION_ADDRESS missing in .env");
  const { altgold } = await getContracts(env);
  const isW = await altgold.isWhitelisted(env.REDEEM);
  if (isW) { console.log("✅ Already whitelisted"); return; }
  console.log("⏳ Whitelisting redemption...");
  await (await altgold.addToWhitelist(env.REDEEM, "REDEMPTION_CONTRACT")).wait();
  console.log("✅ Whitelisted");
}

async function grantRoles() {
  const env = await getEnv();
  if (!env.REDEEM) throw new Error("REDEMPTION_ADDRESS missing in .env");
  const { altgold } = await getContracts(env);
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const has = await altgold.hasRole(BURNER_ROLE, env.REDEEM);
  if (has) { console.log("✅ Redemption already has BURNER_ROLE"); return; }
  console.log("⏳ Granting BURNER_ROLE to redemption...");
  await (await altgold.grantRole(BURNER_ROLE, env.REDEEM)).wait();
  console.log("✅ Granted BURNER_ROLE");
}

async function fundUSDC(amountArg) {
  const env = await getEnv();
  if (!env.REDEEM) throw new Error("REDEMPTION_ADDRESS missing in .env");
  const { usdc } = await getContracts(env);
  const amount = ethers.parseUnits((amountArg || "200000"), 6);
  const bal = await usdc.balanceOf((await ethers.getSigners())[0].address);
  console.log("Admin USDC:", ethers.formatUnits(bal, 6));
  if (bal < amount) throw new Error("Insufficient USDC");
  console.log("⏳ Transferring", ethers.formatUnits(amount, 6), "USDC to redemption...");
  await (await usdc.transfer(env.REDEEM, amount)).wait();
  console.log("✅ Funded USDC");
}

async function fundALT(amountArg) {
  const env = await getEnv();
  if (!env.REDEEM) throw new Error("REDEMPTION_ADDRESS missing in .env");
  const { altgold } = await getContracts(env);
  const minHolding = await altgold.minHoldingAmount();
  const amount = amountArg ? ethers.parseUnits(amountArg, 6) : minHolding;
  const admin = (await ethers.getSigners())[0];
  const adminBal = await altgold.balanceOf(admin.address);
  if (adminBal < amount) throw new Error("Insufficient ALTGOLD");
  console.log("⏳ Transferring", ethers.formatUnits(amount, 6), "ALTGOLD to redemption...");
  await (await altgold.transfer(env.REDEEM, amount)).wait();
  console.log("✅ Funded ALTGOLD");
}

async function fixRates() {
  const env = await getEnv();
  if (!env.REDEEM) throw new Error("REDEMPTION_ADDRESS missing in .env");
  const { redemption } = await getContracts(env);
  const newRate = ethers.parseUnits("65", 6);
  console.log("⏳ Setting USDC per gram to", ethers.formatUnits(newRate, 6));
  await (await redemption.setUSDCPerGram(newRate)).wait();
  console.log("✅ Rate updated");
}

async function showStatus() {
  const env = await getEnv();
  const { altgold, redemption, usdc } = await getContracts(env);
  const admin = (await ethers.getSigners())[0];
  console.log("Admin:", admin.address);
  console.log("ALTGOLD:", env.ALTGOLD);
  console.log("REDEMPTION:", env.REDEEM || "<not set>");
  console.log("USDC:", env.USDC);
  if (redemption) {
    const weight = await redemption.goldWeightPerALT_g6();
    const upg = await redemption.usdcPerGram();
    const buf = await redemption.bufferUSDC();
    const rBal = await usdc.balanceOf(env.REDEEM);
    const altBal = await altgold.balanceOf(env.REDEEM);
    console.log("Gold weight:", ethers.formatUnits(weight, 6), "g");
    console.log("USDC/gram:", ethers.formatUnits(upg, 6));
    console.log("Buffer:", ethers.formatUnits(buf, 6), "USDC");
    console.log("USDC balance:", ethers.formatUnits(rBal, 6));
    console.log("ALTGOLD balance:", ethers.formatUnits(altBal, 6));
  }
}

(async () => {
  const cmd = process.argv[2];
  try {
    if (cmd === "deploy") await deploy();
    else if (cmd === "whitelist") await whitelist();
    else if (cmd === "grant-roles") await grantRoles();
    else if (cmd === "fund-usdc") await fundUSDC(process.argv[3]);
    else if (cmd === "fund-alt") await fundALT(process.argv[3]);
    else if (cmd === "fix-rates") await fixRates();
    else if (cmd === "show-status") await showStatus();
    else {
      console.log("Usage: node scripts/redemption-ops.js <command> [args]\n");
      await showStatus();
    }
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
})();

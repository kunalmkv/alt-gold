const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const DEC = 6n;
const U = (n) => ethers.parseUnits(n.toString(), Number(DEC));

describe("ALTGOLDRedemption Gas (Local)", function () {
  let admin, rateManager, treasurer, user;
  let alt, red, usdc;

  it("deploys and exercises redemption flows for gas report", async function () {
    [admin, rateManager, treasurer, user] = await ethers.getSigners();

    // Deploy ALTGOLD (proxy)
    const ALTGOLD = await ethers.getContractFactory("ALTGOLDToken");
    const ALT = await ethers.getContractFactory("ALTGOLDToken"); alt = await upgrades.deployProxy(ALT, [admin.address, "ALTGOLD Token", "ALTGOLD"], { initializer: "initialize" }); await alt.waitForDeployment();
    // Initialize simple
    
    // Whitelist parties
    await (await alt.addToWhitelist(user.address, "USER")).wait();

    // Set reserves
    const grams = 10_000n * 10n ** DEC;
    const tpg = 1n * 10n ** DEC;
    await (await alt.updateGoldReserve(grams, tpg, "init")).wait();

    // Deploy USDC mock (6 decimals) and fund admin
    const TestUSDC = await ethers.getContractFactory("TestUSDC");
usdc = await (await TestUSDC.deploy("Mock USDC", "USDC", 6, ethers.parseUnits("1000000", 6), admin.address)).waitForDeployment();

    // Deploy Redemption
    const Redemption = await ethers.getContractFactory("ALTGOLDRedemption");
const MockAgg = await ethers.getContractFactory("MockAggregator");
const xau = await (await MockAgg.deploy(8, BigInt(2000)*10n**8n)).waitForDeployment();
red = await upgrades.deployProxy(Redemption, [
  admin.address,
  await alt.getAddress(),
  await usdc.getAddress(),
  1_000_000,
  60,
  3600,
  true,
  false,
  ethers.parseUnits("1000000", 6),
  ethers.parseUnits("100000", 6),
  0,
  0,
  0,
  { startHour: 0, endHour: 23, tzOffsetMin: 0 }
], { initializer: "initialize" });
await red.waitForDeployment();
await (await alt.setAuthorizedBurner(await red.getAddress(), true)).wait();
await (await alt.addToWhitelist(await red.getAddress(), "REDEMPTION")).wait();
expect(await red.getAddress()).to.properAddress;
  });
});


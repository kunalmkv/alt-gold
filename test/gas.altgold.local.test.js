const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const DECIMALS = 6n;
const U = (n) => ethers.parseUnits(n.toString(), Number(DECIMALS));

describe("ALTGOLDToken Gas (Local)", function () {
  let admin, user1, user2;
  let alt;

  it("deploys proxy and performs basic ops for gas report", async function () {
    [admin, user1, user2] = await ethers.getSigners();

    const ALTGOLD = await ethers.getContractFactory("ALTGOLDToken");
    alt = await upgrades.deployProxy(ALTGOLD, [admin.address, "ALTGOLD Token", "ALTGOLD"], { initializer: "initialize" });
    await alt.waitForDeployment();
    await (await alt.connect(admin).addToWhitelist(user1.address, "U1")).wait();
    await (await alt.connect(admin).addToWhitelist(user2.address, "U2")).wait();

    // Set reserves so mint won't revert
    const grams = 1000n * 10n ** DECIMALS;         // 1,000 g * 1e6
    const tpg = 1n * 10n ** DECIMALS;              // 1 ALT per g * 1e6
    await (await alt.connect(admin).updateGoldReserve(grams, tpg, "init-audit")).wait();

    // Mint and transfer to exercise paths
    await (await alt.connect(admin).mint(user1.address, U(100), "seed"))
      .wait();
    await (await alt.connect(user1).transfer(user2.address, U(10)))
      .wait();

    // Burn a small amount
    await (await alt.connect(admin).burn(user2.address, U(1), "burn-test")).wait();

    expect(await alt.balanceOf(user2.address)).to.be.greaterThan(0);
  });
});


require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();
require("hardhat-gas-reporter");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // Required for redemption contract - WARNING: Makes deployment slow (10-20 min)
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID",
      accounts: [
        process.env.PRIVATE_KEY,
        process.env.PRIVATE_KEY_1,
        process.env.PRIVATE_KEY_2,
        process.env.PRIVATE_KEY_3
      ].filter(Boolean),
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    currency: "USD",
    coinmarketcap: process.env.CMC_API_KEY || undefined,
    // Allow overriding prices from env to avoid external API calls
    ethPrice: process.env.ETH_PRICE ? Number(process.env.ETH_PRICE) : undefined,
    gasPrice: process.env.GAS_PRICE ? Number(process.env.GAS_PRICE) : undefined,
    token: "ETH",
    excludeContracts: [],
    showTimeSpent: true,
    outputFile: process.env.GAS_REPORT_FILE || undefined,
    noColors: !!process.env.GAS_REPORT_FILE,
  }
};

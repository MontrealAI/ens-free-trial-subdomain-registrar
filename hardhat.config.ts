import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import { subtask, type HardhatUserConfig } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";

const SOLC_VERSION = "0.8.17";
const SOLC_LONG_VERSION = "0.8.17+commit.8df45f5f";

// Use a pinned local solc-js build to avoid fragile remote compiler downloads.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _hre, runSuper) => {
  if (solcVersion === SOLC_VERSION) {
    return {
      version: SOLC_VERSION,
      longVersion: SOLC_LONG_VERSION,
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true
    };
  }

  return runSuper();
});

const config: HardhatUserConfig = {
  solidity: {
    version: SOLC_VERSION,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    mainnet: {
      chainId: 1,
      url: process.env.MAINNET_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  }
};

export default config;

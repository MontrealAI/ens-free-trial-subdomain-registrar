import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import { subtask, type HardhatUserConfig } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";

const LOCAL_SOLC_BUILDS: Record<string, { longVersion: string; compilerPath: string }> = {
  "0.8.17": {
    longVersion: "0.8.17+commit.8df45f5f",
    compilerPath: require.resolve("solc/soljson.js")
  }
};

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _hre, runSuper) => {
  const local = LOCAL_SOLC_BUILDS[solcVersion];
  if (local) {
    return {
      version: solcVersion,
      longVersion: local.longVersion,
      compilerPath: local.compilerPath,
      isSolcJs: true
    };
  }

  return runSuper();
});

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
          viaIR: false
        }
      }
    ]
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

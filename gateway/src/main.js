import { ChallengeService } from "./challenge-service.js";
import { ConfigError, readConfig } from "./config.js";
import { createGatewayServer } from "./http-server.js";
import { JsonRpcClient } from "./rpc-client.js";
import { ZalletTestnetAdapter } from "./zallet-adapter.js";

async function main() {
  const config = readConfig();
  const zalletRpc = new JsonRpcClient({ ...config.zalletRpc, timeoutMs: config.rpcTimeoutMs });
  const zebraRpc = new JsonRpcClient({ ...config.zebraRpc, timeoutMs: config.rpcTimeoutMs });
  const adapter = new ZalletTestnetAdapter({ zalletRpc, zebraRpc, config });
  const service = new ChallengeService({ adapter, config });
  const server = createGatewayServer({ service, bearerToken: config.bearerToken });

  server.listen(config.port, config.host, () => {
    console.log(`ZITY Zcash testnet gateway listening on ${config.host}:${config.port}`);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}; closing the gateway.`);
    server.close((error) => {
      if (error) {
        console.error("Gateway shutdown failed.");
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error instanceof ConfigError ? error.message : "Gateway startup failed closed.");
  process.exitCode = 1;
});

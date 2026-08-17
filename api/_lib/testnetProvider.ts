import { configuredProvider, explorerServerConfig, testnetServerConfig } from "./config.js";
import { PublicExplorerProvider } from "./PublicExplorerProvider.js";
import { realTestnetGateway, type ZcashTestnetGateway } from "./ZcashTestnetGateway.js";

/**
 * Selects the configured real-testnet implementation. Both satisfy the same
 * contract, so nothing downstream — client, state machine, or UI — changes:
 *
 * - `gateway`  private Zebra + Zallet stack; shielded receivers, self-hosted.
 * - `explorer` public testnet explorer; transparent receiver, no node needed.
 *
 * Neither path has a mock fallback: an unreachable upstream fails closed.
 */
export function testnetProvider(): ZcashTestnetGateway {
  return configuredProvider() === "explorer"
    ? new PublicExplorerProvider(explorerServerConfig())
    : realTestnetGateway(testnetServerConfig());
}

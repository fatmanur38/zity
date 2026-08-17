import { MockSettlementProvider } from "./MockSettlementProvider";
import type { SettlementProvider } from "./types";
import { ZcashTestnetSettlementProvider } from "./ZcashTestnetSettlementProvider";

export function createSettlementProvider(): SettlementProvider {
  if (import.meta.env.VITE_SETTLEMENT_MODE === "zcash-testnet") {
    return new ZcashTestnetSettlementProvider(import.meta.env.VITE_ZCASH_API_URL ?? "");
  }
  return new MockSettlementProvider();
}

export type { SettlementProvider } from "./types";

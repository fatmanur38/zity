import { describe, expect, it } from "vitest";
import type {
  PaymentChallengeStatus,
  PaymentVerification,
  TestnetEntitlement,
  TestnetTransactionInfo,
} from "./contracts";
import { selectFreshestMetroTransaction, shouldRefreshPaymentVerification } from "./controllerPolicy";

const tx = (confirmations: number): TestnetTransactionInfo => ({
  network: "zcash-testnet",
  txid: "a".repeat(64),
  confirmations,
  blockHeight: confirmations > 0 ? 3_000_000 : null,
  detectedAt: "2026-08-17T08:00:00.000Z",
  confirmedAt: confirmations > 0 ? "2026-08-17T08:01:00.000Z" : null,
});

const status = (state: "detected" | "verified", confirmations: number): PaymentChallengeStatus => ({
  challengeId: "00000000-0000-4000-8000-000000000001",
  network: "zcash-testnet",
  providerMode: "real",
  state,
  amount: "0.001",
  recipient: "tmockrecipientaddress000000000000000000000000000000000000000000000",
  expiresAt: "2026-08-17T08:10:00.000Z",
  confirmations,
  requiredConfirmations: 1,
  unlockPolicy: state === "detected" ? "detected" : "confirmed",
  unlockEligible: true,
  transaction: tx(confirmations),
});

const entitlement: TestnetEntitlement = {
  id: "entitlement-controller-policy",
  type: "metro-access",
  source: {
    mode: "testnet",
    challengeId: "00000000-0000-4000-8000-000000000001",
    txid: "a".repeat(64),
  },
  issuedAt: Date.parse("2026-08-17T08:00:00.000Z"),
  maxUses: 1,
  useCount: 0,
};

const verification = (state: "detected" | "verified", confirmations: number): PaymentVerification => ({
  challengeId: "00000000-0000-4000-8000-000000000001",
  network: "zcash-testnet",
  providerMode: "real",
  state,
  verified: state === "verified",
  unlockEligible: true,
  unlockPolicy: state === "detected" ? "detected" : "confirmed",
  transaction: tx(confirmations),
});

describe("testnet controller evidence policy", () => {
  it("refreshes detected evidence when the status becomes confirmed", () => {
    expect(shouldRefreshPaymentVerification(
      status("verified", 1),
      verification("detected", 0),
      entitlement,
    )).toBe(true);
  });

  it("does not re-verify unchanged or already-consumed evidence", () => {
    const detectedStatus = status("detected", 0);
    expect(shouldRefreshPaymentVerification(
      detectedStatus,
      verification("detected", 0),
      entitlement,
    )).toBe(false);
    expect(shouldRefreshPaymentVerification(
      status("verified", 1),
      verification("detected", 0),
      { ...entitlement, useCount: 1 },
    )).toBe(false);
  });

  it("selects the transaction carrying the freshest confirmation evidence", () => {
    expect(selectFreshestMetroTransaction({
      status: status("verified", 2),
      verification: verification("detected", 0),
    })?.confirmations).toBe(2);
  });
});

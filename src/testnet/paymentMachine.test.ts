import { describe, expect, it } from "vitest";
import type { PaymentChallenge, PaymentChallengeStatus, PaymentVerification } from "./contracts";
import {
  createDemoMetroEntitlement,
  createInitialMetroPaymentSession,
  hasUsableMetroEntitlement,
  resolveConfiguredNetworkMode,
  transitionMetroPayment,
} from "./paymentMachine";

const nowMs = Date.parse("2026-08-17T08:00:00.000Z");
const now = new Date(nowMs).toISOString();
const expiresAt = new Date(nowMs + 10 * 60_000).toISOString();
const txid = "a".repeat(64);
const challengeId = "00000000-0000-4000-8000-000000000001";

const challenge: PaymentChallenge = {
  challengeId,
  network: "zcash-testnet",
  providerMode: "real",
  amount: "0.001",
  recipient: "tmockrecipientaddress000000000000000000000000000000000000000000000",
  paymentUri: "zcash:tmockrecipientaddress000000000000000000000000000000000000000000000?amount=0.001",
  expiresAt,
  createdAt: now,
};

const status: PaymentChallengeStatus = {
  challengeId: challenge.challengeId,
  network: "zcash-testnet",
  providerMode: "real",
  state: "verified",
  amount: challenge.amount,
  recipient: challenge.recipient,
  expiresAt: challenge.expiresAt,
  confirmations: 1,
  requiredConfirmations: 1,
  unlockPolicy: "confirmed",
  unlockEligible: true,
  transaction: {
    network: "zcash-testnet",
    txid,
    confirmations: 1,
    blockHeight: 3_000_000,
    detectedAt: now,
    confirmedAt: now,
  },
};

const verification: PaymentVerification = {
  challengeId: challenge.challengeId,
  network: "zcash-testnet",
  providerMode: "real",
  state: "verified",
  verified: true,
  unlockEligible: true,
  unlockPolicy: "confirmed",
  transaction: status.transaction,
};

const beginTestnetPayment = () => {
  let session = createInitialMetroPaymentSession("testnet");
  session = transitionMetroPayment(session, {
    type: "payment/start",
    eventId: "event-start",
    at: now,
    request: { sessionId: "session_1234567890", purpose: "metro-access" },
  });
  session = transitionMetroPayment(session, {
    type: "payment/challenge-received",
    eventId: "event-challenge",
    at: now,
    challenge,
  });
  return session;
};

const observeStatus = (
  session = beginTestnetPayment(),
  incomingStatus: PaymentChallengeStatus = status,
  id = "event-status-before-verification",
) => transitionMetroPayment(session, {
  type: "payment/status-received",
  eventId: id,
  at: now,
  status: incomingStatus,
});

describe("metro payment state machine", () => {
  it("maps explicit client modes without silently turning testnet into demo", () => {
    expect(resolveConfiguredNetworkMode("demo")).toBe("demo");
    expect(resolveConfiguredNetworkMode("testnet")).toBe("testnet");
    expect(() => resolveConfiguredNetworkMode("mock"))
      .toThrow("Unsupported ZITY network mode");
    expect(() => resolveConfiguredNetworkMode("zcash-testnet"))
      .toThrow("Unsupported ZITY network mode");
    expect(() => resolveConfiguredNetworkMode("mainnet"))
      .toThrow("Unsupported ZITY network mode");
  });

  it("keeps the demo journey deterministic and consumes its entitlement once", () => {
    const demo = createInitialMetroPaymentSession("demo");
    const verified = transitionMetroPayment(demo, {
      type: "payment/demo-verified",
      eventId: "demo-verified",
      at: now,
      entitlement: createDemoMetroEntitlement("demo-metro-entitlement", nowMs),
    });

    expect(verified.state).toBe("verified");
    expect(hasUsableMetroEntitlement(verified, nowMs)).toBe(true);

    const consumed = transitionMetroPayment(verified, {
      type: "payment/entitlement-consumed",
      eventId: "demo-consumed",
      at: now,
    });
    expect(consumed.entitlement?.useCount).toBe(1);
    expect(hasUsableMetroEntitlement(consumed, nowMs)).toBe(false);
  });

  it("does not unlock Metro from challenge status alone", () => {
    const session = transitionMetroPayment(beginTestnetPayment(), {
      type: "payment/status-received",
      eventId: "event-status",
      at: now,
      status,
    });

    expect(session.status?.unlockEligible).toBe(true);
    expect(session.entitlement).toBeNull();
    expect(hasUsableMetroEntitlement(session, nowMs)).toBe(false);
  });

  it("issues a local entitlement only from a matching verified payment", () => {
    const withStatus = transitionMetroPayment(beginTestnetPayment(), {
      type: "payment/status-received",
      eventId: "event-status",
      at: now,
      status,
    });
    const verified = transitionMetroPayment(withStatus, {
      type: "payment/verification-received",
      eventId: "event-verification",
      at: now,
      verification,
    });

    expect(verified.verification?.verified).toBe(true);
    expect(verified.entitlement).toMatchObject({
      type: "metro-access",
      source: { mode: "testnet", challengeId: challenge.challengeId, txid },
      maxUses: 1,
      useCount: 0,
    });
    expect(hasUsableMetroEntitlement(verified, nowMs)).toBe(true);
  });

  it("can unlock on detected policy without mislabeling it as confirmed", () => {
    const detectedVerification: PaymentVerification = {
      ...verification,
      state: "detected",
      verified: false,
      unlockPolicy: "detected",
      transaction: {
        ...verification.transaction!,
        confirmations: 0,
        blockHeight: null,
        confirmedAt: null,
      },
    };
    const detectedStatus: PaymentChallengeStatus = {
      ...status,
      state: "detected",
      confirmations: 0,
      requiredConfirmations: 1,
      unlockPolicy: "detected",
      unlockEligible: true,
      transaction: detectedVerification.transaction,
    };
    const detected = transitionMetroPayment(observeStatus(
      beginTestnetPayment(),
      detectedStatus,
      "event-detected-status",
    ), {
      type: "payment/verification-received",
      eventId: "event-detected-policy",
      at: now,
      verification: detectedVerification,
    });

    expect(detected.state).toBe("detected");
    expect(detected.verification?.verified).toBe(false);
    expect(hasUsableMetroEntitlement(detected, nowMs)).toBe(true);
    expect(detected.events.at(-1)?.detail).toBe("payment-detected-unlock-eligible");
  });

  it("revokes an unconsumed entitlement when the observed chain state regresses", () => {
    const verified = transitionMetroPayment(observeStatus(), {
      type: "payment/verification-received",
      eventId: "event-verification-before-reorg",
      at: now,
      verification,
    });
    const regressedStatus: PaymentChallengeStatus = {
      ...status,
      state: "waiting",
      confirmations: 0,
      unlockEligible: false,
      transaction: null,
    };
    const regressed = transitionMetroPayment(verified, {
      type: "payment/status-received",
      eventId: "event-reorg-regression",
      at: now,
      status: regressedStatus,
    });

    expect(regressed.state).toBe("waiting");
    expect(regressed.entitlement).toBeNull();
    expect(regressed.verification).toBeNull();
    expect(hasUsableMetroEntitlement(regressed, nowMs)).toBe(false);
  });

  it("fails closed if the same challenge changes transaction identity", () => {
    const issued = transitionMetroPayment(observeStatus(), {
      type: "payment/verification-received",
      eventId: "event-verification-before-tx-change",
      at: now,
      verification,
    });
    const changedStatus: PaymentChallengeStatus = {
      ...status,
      transaction: {
        ...status.transaction!,
        txid: "d".repeat(64),
      },
    };
    const rejected = transitionMetroPayment(issued, {
      type: "payment/status-received",
      eventId: "event-transaction-changed",
      at: now,
      status: changedStatus,
    });

    expect(rejected.state).toBe("invalid-payment");
    expect(rejected.entitlement).toBeNull();

    const attemptedReissue = transitionMetroPayment(rejected, {
      type: "payment/verification-received",
      eventId: "event-transaction-change-reissue",
      at: now,
      verification: {
        ...verification,
        transaction: changedStatus.transaction,
      },
    });
    expect(attemptedReissue).toBe(rejected);
    expect(attemptedReissue.entitlement).toBeNull();
  });

  it("fails closed when verification provenance does not match the challenge", () => {
    const mismatchedVerification: PaymentVerification = {
      ...verification,
      challengeId: "00000000-0000-4000-8000-000000000002",
    };
    const failed = transitionMetroPayment(observeStatus(), {
      type: "payment/verification-received",
      eventId: "event-invalid-verification",
      at: now,
      verification: mismatchedVerification,
    });

    expect(failed.state).toBe("invalid-payment");
    expect(failed.entitlement).toBeNull();
    expect(hasUsableMetroEntitlement(failed, nowMs)).toBe(false);
  });

  it("treats duplicate transport events as idempotent", () => {
    const session = beginTestnetPayment();
    const transition = {
      type: "payment/status-received" as const,
      eventId: "event-status",
      at: now,
      status,
    };
    const once = transitionMetroPayment(session, transition);
    const twice = transitionMetroPayment(once, transition);

    expect(twice).toBe(once);
    expect(twice.events.filter((event) => event.id === "event-status")).toHaveLength(1);
  });

  it("never reissues a one-use entitlement after a late verification", () => {
    const issued = transitionMetroPayment(observeStatus(), {
      type: "payment/verification-received",
      eventId: "event-issued-before-use",
      at: now,
      verification,
    });
    const consumed = transitionMetroPayment(issued, {
      type: "payment/entitlement-consumed",
      eventId: "event-first-and-only-use",
      at: now,
    });
    const lateVerification = transitionMetroPayment(consumed, {
      type: "payment/verification-received",
      eventId: "event-late-verification",
      at: now,
      verification,
    });

    expect(lateVerification).toBe(consumed);
    expect(lateVerification.entitlement?.useCount).toBe(1);
    expect(hasUsableMetroEntitlement(lateVerification, nowMs)).toBe(false);
  });
});

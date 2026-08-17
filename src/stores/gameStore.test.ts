import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

import { deriveProfile } from "../privacy/engine";
import type {
  PaymentChallenge,
  PaymentVerification,
} from "../testnet/contracts";
import { useGameStore } from "./gameStore";

const state = () => useGameStore.getState();

describe("game journey", () => {
  beforeEach(() => {
    state().configureNetworkMode("demo");
    state().resetExperience();
  });

  it("completes live, analyze, rethink, reuse, and compare as one coherent flow", () => {
    expect(state().stage).toBe("spawn");

    state().markMovement();
    expect(state().stage).toBe("metro-ticket");
    state().buyTicket();
    state().connectMetro();
    state().connectCafe();
    state().connectClinic();

    expect(state().stage).toBe("perspective-shift");
    expect(state().baselineRuns.map((run) => run.scenarioId)).toEqual([
      "metro",
      "cafe",
      "clinic",
    ]);

    state().beginRethink();
    expect(state().stage).toBe("clinic-rethink");
    expect(state().redesignedRuns).toHaveLength(3);

    state().selectDesign("clinic", "hybrid");
    expect(state().stage).toBe("clinic-compare");
    expect(state().designChoices.clinic).toBe("hybrid");
    state().continueComparison();

    state().selectDesign("metro", "minimum");
    expect(state().stage).toBe("metro-compare");
    expect(state().metroPayment.entitlement?.useCount).toBe(1);
    state().continueComparison();
    expect(state().stage).toBe("metro-reuse");

    state().attemptAuthorizationReuse();
    expect(state().authorizationReuseResult).toMatchObject({
      granted: false,
      reason: "already-used",
      identityRevealed: false,
    });
    state().finishAuthorizationReuse();

    state().selectDesign("club", "standard");
    expect(state().stage).toBe("club-compare");
    expect(state().baselineRuns).toHaveLength(4);
    expect(state().redesignedRuns).toHaveLength(4);
    state().continueComparison();

    expect(state().stage).toBe("results");
    expect(state().currentInteraction).toBe("results");
    expect(deriveProfile(state().baselineRuns).metrics.score).toBe(90);
    expect(deriveProfile(state().redesignedRuns).metrics.score).toBe(58);
  });

  it("keeps the standard route playable and gates only redesigned Metro on testnet verification", () => {
    const nowMs = Date.now();
    const at = new Date(nowMs).toISOString();
    const txid = "b".repeat(64);
    const challenge: PaymentChallenge = {
      challengeId: "00000000-0000-4000-8000-000000000003",
      network: "zcash-testnet",
      providerMode: "real",
      amount: "0.001",
      recipient: "tmockrecipientaddress000000000000000000000000000000000000000000000",
      paymentUri: "zcash:tmockrecipientaddress000000000000000000000000000000000000000000000?amount=0.001",
      expiresAt: new Date(nowMs + 600_000).toISOString(),
      createdAt: at,
    };
    const verification: PaymentVerification = {
      challengeId: challenge.challengeId,
      network: "zcash-testnet",
      providerMode: "real",
      state: "verified",
      verified: true,
      unlockEligible: true,
      unlockPolicy: "confirmed",
      transaction: {
        network: "zcash-testnet",
        txid,
        confirmations: 1,
        blockHeight: 3_000_000,
        detectedAt: at,
        confirmedAt: at,
      },
    };
    state().configureNetworkMode("testnet");
    state().markMovement();
    state().buyTicket();
    expect(state().stage).toBe("metro-gate");
    state().connectMetro();
    state().connectCafe();
    state().connectClinic();
    state().beginRethink();
    state().selectDesign("clinic", "minimum");
    state().continueComparison();
    state().selectDesign("metro", "minimum");

    expect(state().stage).toBe("metro-checkpoint");
    expect(state().metroPayment.entitlement).toBeNull();
    state().proveMetroAccess();
    expect(state().stage).toBe("metro-checkpoint");

    state().dispatchMetroPayment({
      type: "payment/start",
      eventId: "store-payment-start",
      at,
      request: { sessionId: "store_session_1234", purpose: "metro-access" },
    });
    state().dispatchMetroPayment({
      type: "payment/challenge-received",
      eventId: "store-payment-challenge",
      at,
      challenge,
    });
    state().dispatchMetroPayment({
      type: "payment/status-received",
      eventId: "store-payment-status",
      at,
      status: {
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
        transaction: verification.transaction,
      },
    });
    state().dispatchMetroPayment({
      type: "payment/verification-received",
      eventId: "store-payment-verified",
      at,
      verification,
    });
    expect(state().stage).toBe("metro-checkpoint");
    expect(state().metroPayment.entitlement?.useCount).toBe(0);
    state().proveMetroAccess();
    expect(state().stage).toBe("metro-compare");
    expect(state().metroPayment.entitlement?.useCount).toBe(1);
    expect(state().redesignedRuns.find((run) => run.scenarioId === "metro")?.choice)
      .toBe("minimum");
  });
});

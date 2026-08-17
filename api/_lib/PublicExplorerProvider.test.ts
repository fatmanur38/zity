import { afterEach, describe, expect, it, vi } from "vitest";
import { paymentChallengeSchema, paymentChallengeStatusSchema } from "../../src/testnet/contracts";
import { assertPrivateZip321Request } from "./ZcashTestnetGateway";
import {
  challengeCreatedAtMs,
  createChallengeId,
  expectedZatoshis,
  PublicExplorerProvider,
  zatoshisToZec,
  zecToZatoshis,
} from "./PublicExplorerProvider";
import type { ExplorerServerConfig } from "./config";

const receiver = "tmFU5Ak942B7SciQpZCh3xH76QV3UmJgnDd";

const config: ExplorerServerConfig = {
  networkMode: "testnet",
  network: "testnet",
  explorerUrl: "https://api.testnet.example",
  receiverAddress: receiver,
  challengeSecret: "0123456789abcdef0123456789abcdef",
  paymentAmount: "0.001",
  minConfirmations: 2,
  challengeTtlSeconds: 600,
  unlockPolicy: "confirmed",
  gatewayTimeoutMs: 1_000,
};

type Route = (url: string) => unknown;

function stubExplorer(route: Route): void {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const payload = route(String(input));
    return { ok: true, status: 200, json: async () => payload } as Response;
  }));
}

const addressPayload = (transactions: unknown[]) => ({ transactions });

const txPayload = (value: bigint, overrides: Record<string, unknown> = {}) => ({
  txid: "a".repeat(64),
  blockHeight: "500",
  blockHash: "b".repeat(64),
  blockTime: "1786971243",
  confirmations: 3,
  isCanonical: true,
  outputs: [{ address: receiver, value: value.toString(), vout_index: 0 }],
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("amount conversion", () => {
  it("round-trips zatoshis and trims trailing zeros", () => {
    expect(zatoshisToZec(100_000n)).toBe("0.001");
    expect(zatoshisToZec(109_999n)).toBe("0.00109999");
    expect(zatoshisToZec(100_000_000n)).toBe("1");
    expect(zecToZatoshis("0.001")).toBe(100_000n);
    expect(zecToZatoshis("1")).toBe(100_000_000n);
  });
});

describe("stateless challenge identity", () => {
  it("recovers creation time from the challenge id", () => {
    const now = Date.now();
    expect(challengeCreatedAtMs(createChallengeId(now))).toBe(now);
  });

  it("rejects a challenge id this provider never issued", () => {
    expect(() => challengeCreatedAtMs("00000000-0000-4000-8000-000000000004")).toThrow(/not issued/i);
  });

  it("derives a unique, secret-bound amount above the base price", () => {
    const first = expectedZatoshis(config, createChallengeId());
    const second = expectedZatoshis(config, createChallengeId());
    const base = zecToZatoshis(config.paymentAmount);

    expect(first).toBeGreaterThanOrEqual(base);
    expect(first).toBeLessThan(base + 10_000n);
    expect(first).not.toBe(second);
  });

  it("does not derive the same amount under a different secret", () => {
    const challengeId = createChallengeId();
    const rotated = { ...config, challengeSecret: "fedcba9876543210fedcba9876543210" };
    expect(expectedZatoshis(config, challengeId)).not.toBe(expectedZatoshis(rotated, challengeId));
  });
});

describe("payment challenge", () => {
  it("issues a metadata-free ZIP-321 request that matches the contract", async () => {
    stubExplorer(() => ({ height: "4279467" }));
    const challenge = await new PublicExplorerProvider(config).createPaymentChallenge({
      sessionId: "opaque_session_7F3A91",
      purpose: "metro-access",
    });

    expect(paymentChallengeSchema.safeParse(challenge).success).toBe(true);
    expect(() => assertPrivateZip321Request(challenge.paymentUri, receiver, challenge.amount)).not.toThrow();
    expect(challenge.paymentUri).not.toMatch(/memo|message|label/i);
  });

  it("refuses to issue a challenge when the explorer is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(new PublicExplorerProvider(config).createPaymentChallenge({
      sessionId: "opaque_session_7F3A91",
      purpose: "metro-access",
    })).rejects.toMatchObject({ code: "TESTNET_NOT_READY" });
  });
});

describe("payment verification", () => {
  const challengeId = createChallengeId();
  const expected = expectedZatoshis(config, challengeId);
  const createdSeconds = Math.floor(challengeCreatedAtMs(challengeId) / 1_000);

  it("stays in waiting while no matching amount has arrived", async () => {
    stubExplorer((url) => url.includes("/api/address/")
      ? addressPayload([{ txid: "a".repeat(64), blockHeight: "500", blockTime: String(createdSeconds), netChange: "1" }])
      : { height: "500" });

    const status = await new PublicExplorerProvider(config).getPaymentChallengeStatus(challengeId);
    expect(status.state).toBe("waiting");
    expect(status.transaction).toBeNull();
    expect(status.unlockEligible).toBe(false);
    expect(paymentChallengeStatusSchema.safeParse(status).success).toBe(true);
  });

  it("reports confirming without unlocking below the required confirmations", async () => {
    stubExplorer((url) => {
      if (url.includes("/api/address/")) {
        return addressPayload([{
          txid: "a".repeat(64),
          blockHeight: "500",
          blockTime: String(createdSeconds),
          netChange: expected.toString(),
        }]);
      }
      if (url.includes("/api/tx/")) return txPayload(expected);
      return { height: "500" };
    });

    const status = await new PublicExplorerProvider(config).getPaymentChallengeStatus(challengeId);
    expect(status.state).toBe("confirming");
    expect(status.confirmations).toBe(1);
    expect(status.unlockEligible).toBe(false);
    expect(status.transaction?.confirmedAt).toBeNull();
  });

  it("verifies and unlocks once the confirmation threshold is met", async () => {
    stubExplorer((url) => {
      if (url.includes("/api/address/")) {
        return addressPayload([{
          txid: "a".repeat(64),
          blockHeight: "500",
          blockTime: String(createdSeconds),
          netChange: expected.toString(),
        }]);
      }
      if (url.includes("/api/tx/")) return txPayload(expected);
      return { height: "501" };
    });

    const provider = new PublicExplorerProvider(config);
    const status = await provider.getPaymentChallengeStatus(challengeId);
    expect(status.state).toBe("verified");
    expect(status.confirmations).toBe(2);
    expect(status.unlockEligible).toBe(true);

    const verification = await provider.verifyPayment(challengeId);
    expect(verification.verified).toBe(true);
    expect(verification.transaction?.txid).toBe("a".repeat(64));
  });

  it("rejects a wrong amount paid to the correct receiver", async () => {
    stubExplorer((url) => {
      if (url.includes("/api/address/")) {
        return addressPayload([{
          txid: "a".repeat(64),
          blockHeight: "500",
          blockTime: String(createdSeconds),
          netChange: (expected + 1n).toString(),
        }]);
      }
      if (url.includes("/api/tx/")) return txPayload(expected + 1n);
      return { height: "501" };
    });

    const status = await new PublicExplorerProvider(config).getPaymentChallengeStatus(challengeId);
    expect(status.state).toBe("waiting");
    expect(status.transaction).toBeNull();
  });

  it("ignores a correct amount that predates the challenge", async () => {
    stubExplorer((url) => {
      if (url.includes("/api/address/")) {
        return addressPayload([{
          txid: "a".repeat(64),
          blockHeight: "400",
          blockTime: String(createdSeconds - 3_600),
          netChange: expected.toString(),
        }]);
      }
      if (url.includes("/api/tx/")) return txPayload(expected);
      return { height: "501" };
    });

    const status = await new PublicExplorerProvider(config).getPaymentChallengeStatus(challengeId);
    expect(status.state).toBe("waiting");
  });

  it("refuses a listing whose transaction outputs do not prove the receiver", async () => {
    stubExplorer((url) => {
      if (url.includes("/api/address/")) {
        return addressPayload([{
          txid: "a".repeat(64),
          blockHeight: "500",
          blockTime: String(createdSeconds),
          netChange: expected.toString(),
        }]);
      }
      if (url.includes("/api/tx/")) {
        return txPayload(expected, {
          outputs: [{ address: "tmSomeoneElseAddressNotOurReceiver1", value: expected.toString() }],
        });
      }
      return { height: "501" };
    });

    const status = await new PublicExplorerProvider(config).getPaymentChallengeStatus(challengeId);
    expect(status.state).toBe("waiting");
  });

  it("refuses a non-canonical transaction after a reorg", async () => {
    stubExplorer((url) => {
      if (url.includes("/api/address/")) {
        return addressPayload([{
          txid: "a".repeat(64),
          blockHeight: "500",
          blockTime: String(createdSeconds),
          netChange: expected.toString(),
        }]);
      }
      if (url.includes("/api/tx/")) return txPayload(expected, { isCanonical: false });
      return { height: "501" };
    });

    const status = await new PublicExplorerProvider(config).getPaymentChallengeStatus(challengeId);
    expect(status.state).toBe("waiting");
  });

  it("never reports a mined payment as zero-confirmation on a lagging tip", async () => {
    // The explorer tip can trail the block the payment landed in, because the
    // address scan is slow enough for a new block to arrive mid-request.
    stubExplorer((url) => {
      if (url.includes("/api/address/")) {
        return addressPayload([{
          txid: "a".repeat(64),
          blockHeight: "4279481",
          blockTime: String(createdSeconds),
          netChange: expected.toString(),
        }]);
      }
      if (url.includes("/api/tx/")) return txPayload(expected);
      return { height: "4279480" };
    });

    const status = await new PublicExplorerProvider(config).getPaymentChallengeStatus(challengeId);
    expect(status.confirmations).toBe(1);
    expect(status.state).toBe("confirming");
    expect(status.transaction?.blockHeight).toBe(4279481);
    expect(paymentChallengeStatusSchema.safeParse(status).success).toBe(true);
  });

  it("expires a challenge whose window has passed with no payment", async () => {
    const stale = createChallengeId(Date.now() - 700 * 1_000);
    stubExplorer((url) => url.includes("/api/address/") ? addressPayload([]) : { height: "501" });

    const status = await new PublicExplorerProvider(config).getPaymentChallengeStatus(stale);
    expect(status.state).toBe("expired");
    expect(status.unlockEligible).toBe(false);
  });
});

describe("explorer health", () => {
  it("reports a real provider mode when the explorer answers", async () => {
    stubExplorer(() => ({ height: "4279467" }));
    const health = await new PublicExplorerProvider(config).health();
    expect(health).toMatchObject({ providerMode: "real", connected: true, synced: true, blockHeight: 4279467 });
  });

  it("fails closed instead of claiming readiness when the explorer is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const health = await new PublicExplorerProvider(config).health();
    expect(health).toMatchObject({ connected: false, synced: false, indexerAvailable: false });
  });
});

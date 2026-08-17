import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaymentChallengeInputSchema } from "../../src/testnet/contracts";
import { testnetServerConfig } from "./config";
import {
  assertPrivateZip321Request,
  HttpZcashTestnetGateway,
} from "./ZcashTestnetGateway";

const testnetRecipient = "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez";
const testChallengeId = "00000000-0000-4000-8000-000000000004";
const gatewayConfig = {
  networkMode: "testnet" as const,
  network: "testnet" as const,
  gatewayUrl: "https://gateway.example.test",
  gatewayToken: "test-gateway-token",
  paymentAmount: "0.001",
  minConfirmations: 1,
  challengeTtlSeconds: 600,
  unlockPolicy: "confirmed" as const,
  gatewayTimeoutMs: 1_000,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("real testnet boundary", () => {
  it("rejects personal fields in payment challenge input", () => {
    const parsed = createPaymentChallengeInputSchema.safeParse({
      sessionId: "opaque_session_7F3A91",
      purpose: "metro-access",
      email: "person@example.test",
      medicalRelationship: true,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a metadata-free ZIP-321 testnet request and rejects identifying metadata", () => {
    const valid = `zcash:${testnetRecipient}?amount=0.001`;
    expect(() => assertPrivateZip321Request(valid, testnetRecipient, "0.001")).not.toThrow();
    expect(() => assertPrivateZip321Request(`${valid}&message=player`, testnetRecipient, "0.001"))
      .toThrowError(/must not include metadata/i);
    expect(() => assertPrivateZip321Request(`${valid}&note=person%40example.test`, testnetRecipient, "0.001"))
      .toThrowError(/must not include metadata/i);
    expect(() => assertPrivateZip321Request("zcash:u1mainnetexample?amount=0.001", "u1mainnetexample", "0.001"))
      .toThrowError(/testnet receiver/i);
  });

  it("fails closed when configuration names mainnet", () => {
    vi.stubEnv("ZITY_NETWORK_MODE", "testnet");
    vi.stubEnv("ZITY_ZCASH_NETWORK", "mainnet");
    vi.stubEnv("ZITY_TESTNET_GATEWAY_URL", "https://gateway.example.test");

    expect(() => testnetServerConfig()).toThrowError(/refuses to use any network other than testnet/i);
  });

  it("refuses an unauthenticated real gateway", () => {
    vi.stubEnv("ZITY_NETWORK_MODE", "testnet");
    vi.stubEnv("ZITY_ZCASH_NETWORK", "testnet");
    vi.stubEnv("ZITY_TESTNET_GATEWAY_URL", "https://gateway.example.test");
    vi.stubEnv("ZITY_TESTNET_GATEWAY_TOKEN", "");

    expect(() => testnetServerConfig()).toThrowError(/authenticated gateway access/i);
  });

  it("sends only opaque challenge data and testnet policy to the real gateway", async () => {
    const requests: unknown[] = [];
    const authorizationHeaders: Array<string | null> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      authorizationHeaders.push(new Headers(init?.headers).get("authorization"));
      if (String(url).endsWith("/v1/health")) {
        return new Response(JSON.stringify({
          network: "testnet",
          providerMode: "real",
          connected: true,
          synced: true,
          blockHeight: 3_000_000,
          walletAvailable: true,
          indexerAvailable: true,
          checkedAt: "2026-08-17T09:00:00.000Z",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      requests.push(JSON.parse(String(init?.body)) as unknown);
      return new Response(JSON.stringify({
        challengeId: testChallengeId,
        network: "zcash-testnet",
        providerMode: "real",
        amount: "0.001",
        recipient: testnetRecipient,
        paymentUri: `zcash:${testnetRecipient}?amount=0.001`,
        expiresAt: "2026-08-17T09:00:00.000Z",
      }), { status: 201, headers: { "content-type": "application/json" } });
    }));

    const gateway = new HttpZcashTestnetGateway(gatewayConfig);
    await gateway.createPaymentChallenge({
      sessionId: "opaque_session_7F3A91",
      purpose: "metro-access",
    });

    expect(requests).toEqual([{
      sessionId: "opaque_session_7F3A91",
      purpose: "metro-access",
      network: "testnet",
      amount: "0.001",
      minConfirmations: 1,
      ttlSeconds: 600,
      unlockPolicy: "confirmed",
      freshReceiver: true,
    }]);
    expect(JSON.stringify(requests)).not.toMatch(/name|email|phone|birthDate|medicalRelationship|score/i);
    expect(authorizationHeaders).toEqual([
      "Bearer test-gateway-token",
      "Bearer test-gateway-token",
    ]);
  });

  it("rejects contradictory confirmation counts from the gateway", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      challengeId: testChallengeId,
      network: "zcash-testnet",
      providerMode: "real",
      state: "verified",
      amount: "0.001",
      recipient: testnetRecipient,
      expiresAt: "2026-08-17T09:10:00.000Z",
      confirmations: 0,
      requiredConfirmations: 1,
      unlockPolicy: "confirmed",
      unlockEligible: true,
      transaction: {
        network: "zcash-testnet",
        txid: "a".repeat(64),
        confirmations: 1,
        blockHeight: 3_000_000,
        detectedAt: "2026-08-17T09:00:00.000Z",
        confirmedAt: "2026-08-17T09:01:00.000Z",
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(new HttpZcashTestnetGateway(gatewayConfig)
      .getPaymentChallengeStatus(testChallengeId))
      .rejects.toThrow(/inconsistent confirmation counts/i);
  });

  it("rejects a verified label without the configured on-chain confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      challengeId: testChallengeId,
      network: "zcash-testnet",
      providerMode: "real",
      state: "verified",
      verified: true,
      unlockEligible: true,
      unlockPolicy: "confirmed",
      transaction: {
        network: "zcash-testnet",
        txid: "b".repeat(64),
        confirmations: 0,
        blockHeight: null,
        detectedAt: "2026-08-17T09:00:00.000Z",
        confirmedAt: null,
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(new HttpZcashTestnetGateway(gatewayConfig).verifyPayment(testChallengeId))
      .rejects.toThrow(/configured confirmation threshold/i);
  });

  it("accepts one mined confirmation while a two-confirmation policy is still pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      challengeId: testChallengeId,
      network: "zcash-testnet",
      providerMode: "real",
      state: "confirming",
      amount: "0.001",
      recipient: testnetRecipient,
      expiresAt: "2026-08-17T09:10:00.000Z",
      confirmations: 1,
      requiredConfirmations: 2,
      unlockPolicy: "confirmed",
      unlockEligible: false,
      transaction: {
        network: "zcash-testnet",
        txid: "c".repeat(64),
        confirmations: 1,
        blockHeight: 3_000_001,
        detectedAt: "2026-08-17T09:00:00.000Z",
        confirmedAt: null,
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const twoConfirmationConfig = { ...gatewayConfig, minConfirmations: 2 };

    await expect(new HttpZcashTestnetGateway(twoConfirmationConfig)
      .getPaymentChallengeStatus(testChallengeId))
      .resolves.toMatchObject({ state: "confirming", confirmations: 1, unlockEligible: false });
  });
});

import { z } from "zod";
import { unlockPolicySchema, zecAmountSchema, type TestnetUnlockPolicy } from "../../src/testnet/contracts.js";
import { ApiFailure } from "./http.js";

const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const optionalNonEmptyString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  ZITY_NETWORK_MODE: z.enum(["demo", "testnet"]).default("demo"),
  ZITY_ZCASH_NETWORK: z.string().default("testnet"),
  ZITY_TESTNET_PROVIDER: z.enum(["gateway", "explorer"]).default("gateway"),
  ZITY_TESTNET_EXPLORER_URL: z.string().url().default("https://api.testnet.cipherscan.app"),
  ZITY_TESTNET_EXPLORER_TIMEOUT_MS: positiveInteger(15_000),
  ZITY_TESTNET_RECEIVER_ADDRESS: optionalNonEmptyString,
  ZITY_TESTNET_CHALLENGE_SECRET: optionalNonEmptyString,
  ZITY_TESTNET_GATEWAY_URL: z.string().url().optional(),
  ZITY_TESTNET_GATEWAY_TOKEN: optionalNonEmptyString,
  ZITY_TESTNET_PAYMENT_AMOUNT: zecAmountSchema.default("0.001"),
  ZITY_TESTNET_MIN_CONFIRMATIONS: positiveInteger(1),
  ZITY_TESTNET_CHALLENGE_TTL_SECONDS: positiveInteger(600),
  ZITY_TESTNET_UNLOCK_POLICY: unlockPolicySchema.default("confirmed"),
  ZITY_TESTNET_GATEWAY_TIMEOUT_MS: positiveInteger(8_000),
  NODE_ENV: z.string().optional(),
}).passthrough();

export type TestnetServerConfig = {
  networkMode: "testnet";
  network: "testnet";
  gatewayUrl: string;
  gatewayToken: string;
  paymentAmount: string;
  minConfirmations: number;
  challengeTtlSeconds: number;
  unlockPolicy: TestnetUnlockPolicy;
  gatewayTimeoutMs: number;
};

export type ExplorerServerConfig = {
  networkMode: "testnet";
  network: "testnet";
  explorerUrl: string;
  receiverAddress: string;
  challengeSecret: string;
  paymentAmount: string;
  minConfirmations: number;
  challengeTtlSeconds: number;
  unlockPolicy: TestnetUnlockPolicy;
  gatewayTimeoutMs: number;
};

export function configuredNetworkMode(): "demo" | "testnet" {
  return environmentSchema.parse(process.env).ZITY_NETWORK_MODE;
}

export function configuredProvider(): "gateway" | "explorer" {
  return environmentSchema.parse(process.env).ZITY_TESTNET_PROVIDER;
}

/**
 * Testnet transparent addresses only. A public explorer cannot see shielded
 * output values or recipients, so a z-address receiver could never be proven
 * and must fail closed at configuration time rather than silently never match.
 */
const TESTNET_TRANSPARENT_ADDRESS = /^(?:tm[1-9A-HJ-NP-Za-km-z]{33}|t2[1-9A-HJ-NP-Za-km-z]{33})$/;

export function explorerServerConfig(): ExplorerServerConfig {
  const environment = environmentSchema.parse(process.env);
  if (environment.ZITY_NETWORK_MODE !== "testnet") {
    throw new ApiFailure(503, "TESTNET_DISABLED", "Real testnet mode is not enabled on this deployment.");
  }
  if (environment.ZITY_ZCASH_NETWORK.toLowerCase() !== "testnet") {
    throw new ApiFailure(503, "NETWORK_MISMATCH", "ZITY refuses to use any network other than testnet.");
  }

  const explorerUrl = new URL(environment.ZITY_TESTNET_EXPLORER_URL);
  if (explorerUrl.protocol !== "https:") {
    throw new ApiFailure(503, "INSECURE_EXPLORER_URL", "The public explorer must be reached over HTTPS.");
  }

  const receiver = environment.ZITY_TESTNET_RECEIVER_ADDRESS;
  if (!receiver) {
    throw new ApiFailure(503, "RECEIVER_NOT_CONFIGURED", "Explorer mode requires ZITY_TESTNET_RECEIVER_ADDRESS.");
  }
  if (!TESTNET_TRANSPARENT_ADDRESS.test(receiver)) {
    throw new ApiFailure(
      503,
      "RECEIVER_NOT_TRANSPARENT_TESTNET",
      "Explorer mode needs a testnet transparent address (tm… or t2…); shielded receivers cannot be verified publicly.",
    );
  }

  const secret = environment.ZITY_TESTNET_CHALLENGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiFailure(
      503,
      "CHALLENGE_SECRET_REQUIRED",
      "Explorer mode requires ZITY_TESTNET_CHALLENGE_SECRET of at least 32 characters.",
    );
  }

  return {
    networkMode: "testnet",
    network: "testnet",
    explorerUrl: explorerUrl.toString().replace(/\/$/, ""),
    receiverAddress: receiver,
    challengeSecret: secret,
    paymentAmount: environment.ZITY_TESTNET_PAYMENT_AMOUNT,
    minConfirmations: environment.ZITY_TESTNET_MIN_CONFIRMATIONS,
    challengeTtlSeconds: environment.ZITY_TESTNET_CHALLENGE_TTL_SECONDS,
    unlockPolicy: environment.ZITY_TESTNET_UNLOCK_POLICY,
    // Public explorers answer more slowly than a private node, and an address
    // gets slower as its history grows, so this budget is separate and larger.
    gatewayTimeoutMs: environment.ZITY_TESTNET_EXPLORER_TIMEOUT_MS,
  };
}

export function testnetServerConfig(): TestnetServerConfig {
  const environment = environmentSchema.parse(process.env);
  if (environment.ZITY_NETWORK_MODE !== "testnet") {
    throw new ApiFailure(503, "TESTNET_DISABLED", "Real testnet mode is not enabled on this deployment.");
  }
  if (environment.ZITY_ZCASH_NETWORK.toLowerCase() !== "testnet") {
    throw new ApiFailure(503, "NETWORK_MISMATCH", "ZITY refuses to use any network other than testnet.");
  }
  if (!environment.ZITY_TESTNET_GATEWAY_URL) {
    throw new ApiFailure(503, "TESTNET_NOT_CONFIGURED", "The Zcash testnet gateway URL is not configured.");
  }
  const url = new URL(environment.ZITY_TESTNET_GATEWAY_URL);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && environment.NODE_ENV !== "production")) {
    throw new ApiFailure(503, "INSECURE_GATEWAY_URL", "The testnet gateway must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new ApiFailure(503, "INVALID_GATEWAY_URL", "Gateway credentials must not be embedded in the URL.");
  }
  if (!environment.ZITY_TESTNET_GATEWAY_TOKEN) {
    throw new ApiFailure(503, "GATEWAY_AUTH_REQUIRED", "Real testnet mode requires authenticated gateway access.");
  }

  return {
    networkMode: "testnet",
    network: "testnet",
    gatewayUrl: url.toString().replace(/\/$/, ""),
    gatewayToken: environment.ZITY_TESTNET_GATEWAY_TOKEN,
    paymentAmount: environment.ZITY_TESTNET_PAYMENT_AMOUNT,
    minConfirmations: environment.ZITY_TESTNET_MIN_CONFIRMATIONS,
    challengeTtlSeconds: environment.ZITY_TESTNET_CHALLENGE_TTL_SECONDS,
    unlockPolicy: environment.ZITY_TESTNET_UNLOCK_POLICY,
    gatewayTimeoutMs: environment.ZITY_TESTNET_GATEWAY_TIMEOUT_MS,
  };
}

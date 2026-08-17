import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  type CreatePaymentChallengeInput,
  type PaymentChallenge,
  type PaymentChallengeStatus,
  type PaymentVerification,
  type TestnetHealth,
  type TestnetPaymentState,
  type TestnetTransactionInfo,
} from "../../src/testnet/contracts.js";
import type { ExplorerServerConfig } from "./config.js";
import { ApiFailure } from "./http.js";
import type { ZcashTestnetGateway } from "./ZcashTestnetGateway.js";

const ZATOSHIS_PER_ZEC = 100_000_000n;

/**
 * Distinct zatoshi slots reserved for per-challenge amount attribution. A
 * public explorer cannot derive a fresh receiver per challenge the way a
 * wallet can, so each challenge is instead identified by a unique amount
 * paid to one static receiver.
 */
const AMOUNT_SLOTS = 10_000n;

/** Tolerated clock skew between this deployment and explorer block times. */
const CLOCK_SKEW_SECONDS = 180;

/** Address history page size; the explorer caps `limit` at 100. */
const ADDRESS_PAGE_LIMIT = 100;

/**
 * How long a chain tip reading may be reused. Testnet blocks are ~150s apart,
 * and a stale tip can only ever under-report confirmations — never unlock
 * early — so this is safe. It exists to spend less of the public explorer's
 * shared rate limit while several viewers poll at once.
 */
const HEIGHT_CACHE_MS = 10_000;

/**
 * Best-effort, per-instance only. Serverless gives no shared state, so this
 * smooths repeated polling inside one warm instance; it is a courtesy to the
 * explorer, never a correctness mechanism.
 */
let cachedHeight: { value: number; readAt: number } | null = null;

/** Clears the cache so tests observe each stubbed tip rather than a stale one. */
export function resetChainHeightCache(): void {
  cachedHeight = null;
}

export function zatoshisToZec(zatoshis: bigint): string {
  const whole = zatoshis / ZATOSHIS_PER_ZEC;
  const fraction = (zatoshis % ZATOSHIS_PER_ZEC).toString().padStart(8, "0").replace(/0+$/, "");
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
}

export function zecToZatoshis(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * ZATOSHIS_PER_ZEC + BigInt(fraction.padEnd(8, "0").slice(0, 8));
}

/**
 * UUIDv7 carries its creation time in the leading 48 bits. That makes each
 * challenge self-describing, so this provider needs no database while still
 * bounding how long a payment request stays valid.
 */
export function createChallengeId(now = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function challengeCreatedAtMs(challengeId: string): number {
  const compact = challengeId.replace(/-/g, "");
  if (compact.length !== 32 || compact[12] !== "7") {
    throw new ApiFailure(400, "UNKNOWN_CHALLENGE", "This challenge was not issued by explorer mode.");
  }
  const milliseconds = Number.parseInt(compact.slice(0, 12), 16);
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new ApiFailure(400, "UNKNOWN_CHALLENGE", "This challenge carries no usable creation time.");
  }
  return milliseconds;
}

/**
 * Derives the challenge's unique amount from a server-held secret, so the
 * expected value is recomputable from the challenge id alone and cannot be
 * chosen or predicted by a client.
 */
export function expectedZatoshis(config: ExplorerServerConfig, challengeId: string): bigint {
  const digest = createHmac("sha256", config.challengeSecret).update(challengeId).digest("hex");
  const slot = BigInt(`0x${digest.slice(0, 16)}`) % AMOUNT_SLOTS;
  return zecToZatoshis(config.paymentAmount) + slot;
}

type ExplorerTransaction = {
  txid: string;
  blockHeight: number;
  blockTime: number;
  netChange: bigint;
};

function asInteger(value: unknown, field: string): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    throw new ApiFailure(502, "INVALID_EXPLORER_RESPONSE", `Explorer returned a non-numeric ${field}.`);
  }
  return Math.trunc(numeric);
}

function asBigInt(value: unknown, field: string): bigint {
  try {
    return BigInt(typeof value === "number" ? Math.trunc(value) : String(value));
  } catch {
    throw new ApiFailure(502, "INVALID_EXPLORER_RESPONSE", `Explorer returned a non-integer ${field}.`);
  }
}

export class PublicExplorerProvider implements ZcashTestnetGateway {
  constructor(private readonly config: ExplorerServerConfig) {}

  async health(): Promise<TestnetHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const info = await this.request("/api/info") as { height?: unknown; blocks?: unknown };
      const height = asInteger(info.height ?? info.blocks, "height");
      return {
        network: "testnet",
        providerMode: "real",
        connected: true,
        synced: height > 0,
        blockHeight: height,
        walletAvailable: true,
        indexerAvailable: true,
        checkedAt,
        message: "Verifying against the public Zcash testnet explorer.",
      };
    } catch {
      return {
        network: "testnet",
        providerMode: "real",
        connected: false,
        synced: false,
        blockHeight: null,
        walletAvailable: false,
        indexerAvailable: false,
        checkedAt,
        message: "The public Zcash testnet explorer is unreachable.",
      };
    }
  }

  async createPaymentChallenge(_input: CreatePaymentChallengeInput): Promise<PaymentChallenge> {
    const health = await this.health();
    if (!health.connected || !health.synced) {
      throw new ApiFailure(503, "TESTNET_NOT_READY", "The public testnet explorer is not ready.", true);
    }

    const createdAt = Date.now();
    const challengeId = createChallengeId(createdAt);
    const amount = zatoshisToZec(expectedZatoshis(this.config, challengeId));

    return {
      challengeId,
      network: "zcash-testnet",
      providerMode: "real",
      amount,
      recipient: this.config.receiverAddress,
      paymentUri: `zcash:${this.config.receiverAddress}?amount=${amount}`,
      expiresAt: new Date(createdAt + this.config.challengeTtlSeconds * 1_000).toISOString(),
      createdAt: new Date(createdAt).toISOString(),
    };
  }

  async getPaymentChallengeStatus(challengeId: string): Promise<PaymentChallengeStatus> {
    const createdAtMs = challengeCreatedAtMs(challengeId);
    const expiresAtMs = createdAtMs + this.config.challengeTtlSeconds * 1_000;
    const expected = expectedZatoshis(this.config, challengeId);
    const amount = zatoshisToZec(expected);

    // The address scan is the slow call, so the tip is read afterwards: a tip
    // sampled first can be older than the block the payment landed in, which
    // would report a mined transaction as having zero confirmations.
    const match = await this.findPayment(expected, createdAtMs);
    const chainHeight = await this.chainHeight();

    const base = {
      challengeId,
      network: "zcash-testnet" as const,
      providerMode: "real" as const,
      amount,
      recipient: this.config.receiverAddress,
      expiresAt: new Date(expiresAtMs).toISOString(),
      requiredConfirmations: this.config.minConfirmations,
      unlockPolicy: this.config.unlockPolicy,
    };

    if (!match) {
      const expired = Date.now() > expiresAtMs;
      return {
        ...base,
        state: expired ? "expired" : "waiting",
        confirmations: 0,
        unlockEligible: false,
        transaction: null,
        ...(expired
          ? { errorCode: "CHALLENGE_EXPIRED", errorMessage: "No matching payment arrived before expiry." }
          : {}),
      };
    }

    // Seeing the payment inside a block proves the chain reached that height,
    // so a lagging tip reading can never drag a mined payment below one
    // confirmation — the state contract forbids "confirming" with zero.
    const tip = Math.max(chainHeight, match.blockHeight);
    const confirmations = tip - match.blockHeight + 1;
    const detectedAt = new Date(match.blockTime * 1_000).toISOString();
    const verified = confirmations >= this.config.minConfirmations;
    const state: TestnetPaymentState = verified ? "verified" : "confirming";

    const transaction: TestnetTransactionInfo = {
      network: "zcash-testnet",
      txid: match.txid,
      confirmations,
      blockHeight: match.blockHeight,
      detectedAt,
      confirmedAt: verified ? detectedAt : null,
    };

    return {
      ...base,
      state,
      confirmations,
      unlockEligible: this.config.unlockPolicy === "detected" ? true : verified,
      transaction,
    };
  }

  async verifyPayment(challengeId: string): Promise<PaymentVerification> {
    const status = await this.getPaymentChallengeStatus(challengeId);
    return {
      challengeId,
      network: "zcash-testnet",
      providerMode: "real",
      state: status.state,
      verified: status.state === "verified",
      unlockEligible: status.unlockEligible,
      unlockPolicy: status.unlockPolicy,
      transaction: status.transaction,
    };
  }

  async getTransaction(txid: string): Promise<TestnetTransactionInfo> {
    const payload = await this.request(`/api/tx/${encodeURIComponent(txid)}`) as Record<string, unknown>;
    if (String(payload.txid).toLowerCase() !== txid.toLowerCase()) {
      throw new ApiFailure(502, "TRANSACTION_MISMATCH", "Explorer returned a different transaction.");
    }
    const blockTime = asInteger(payload.blockTime, "blockTime");
    const confirmations = asInteger(payload.confirmations ?? 0, "confirmations");
    const detectedAt = new Date(blockTime * 1_000).toISOString();

    return {
      network: "zcash-testnet",
      txid: String(payload.txid),
      confirmations: Math.max(0, confirmations),
      blockHeight: payload.blockHeight == null ? null : asInteger(payload.blockHeight, "blockHeight"),
      blockHash: typeof payload.blockHash === "string" ? payload.blockHash : null,
      detectedAt,
      confirmedAt: confirmations >= this.config.minConfirmations ? detectedAt : null,
    };
  }

  private async chainHeight(): Promise<number> {
    if (cachedHeight && Date.now() - cachedHeight.readAt < HEIGHT_CACHE_MS) {
      return cachedHeight.value;
    }
    const info = await this.request("/api/info") as { height?: unknown; blocks?: unknown };
    const value = asInteger(info.height ?? info.blocks, "height");
    cachedHeight = { value, readAt: Date.now() };
    return value;
  }

  /**
   * Finds a payment carrying this challenge's exact amount, then re-proves it
   * against the transaction's own outputs. The address listing alone is not
   * trusted: `netChange` aggregates per address, so only an output matching
   * both the receiver and the exact zatoshi value authorizes a challenge.
   */
  private async findPayment(expected: bigint, createdAtMs: number): Promise<ExplorerTransaction | null> {
    const earliestSeconds = Math.floor(createdAtMs / 1_000) - CLOCK_SKEW_SECONDS;
    const payload = await this.request(
      `/api/address/${encodeURIComponent(this.config.receiverAddress)}?limit=${ADDRESS_PAGE_LIMIT}`,
    ) as { transactions?: unknown };

    const rows = Array.isArray(payload.transactions) ? payload.transactions : [];
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const entry = row as Record<string, unknown>;
      const blockTime = asInteger(entry.blockTime, "blockTime");
      if (blockTime < earliestSeconds) continue;
      if (asBigInt(entry.netChange ?? 0, "netChange") !== expected) continue;

      const txid = String(entry.txid);
      if (!/^[a-fA-F0-9]{64}$/.test(txid)) continue;
      if (!await this.provesExactOutput(txid, expected)) continue;

      return {
        txid,
        blockHeight: asInteger(entry.blockHeight, "blockHeight"),
        blockTime,
        netChange: expected,
      };
    }
    return null;
  }

  private async provesExactOutput(txid: string, expected: bigint): Promise<boolean> {
    const payload = await this.request(`/api/tx/${encodeURIComponent(txid)}`) as Record<string, unknown>;
    if (payload.isCanonical === false) return false;

    const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
    return outputs.some((output) => {
      if (typeof output !== "object" || output === null) return false;
      const entry = output as Record<string, unknown>;
      if (entry.address !== this.config.receiverAddress) return false;
      try {
        return asBigInt(entry.value, "value") === expected;
      } catch {
        return false;
      }
    });
  }

  private async request(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.gatewayTimeoutMs);
    try {
      const response = await fetch(`${this.config.explorerUrl}${path}`, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ApiFailure(
          response.status >= 500 ? 503 : 502,
          response.status === 429 ? "EXPLORER_RATE_LIMITED" : "EXPLORER_REQUEST_FAILED",
          response.status === 429
            ? "The public explorer rate limit was reached; retry shortly."
            : "The public testnet explorer rejected the request.",
          response.status >= 500 || response.status === 429,
          `Upstream HTTP ${response.status}`,
        );
      }
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiFailure(504, "EXPLORER_TIMEOUT", "The public testnet explorer timed out.", true);
      }
      throw new ApiFailure(503, "TESTNET_CONNECTION_UNAVAILABLE", "The public testnet explorer is unavailable.", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Constant-time compare kept for callers that match opaque session values. */
export function safeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

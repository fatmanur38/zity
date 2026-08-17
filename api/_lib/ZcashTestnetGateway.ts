import {
  paymentChallengeSchema,
  paymentChallengeStatusSchema,
  paymentVerificationSchema,
  testnetHealthSchema,
  testnetTransactionInfoSchema,
  type CreatePaymentChallengeInput,
  type PaymentChallenge,
  type PaymentChallengeStatus,
  type PaymentVerification,
  type TestnetHealth,
  type TestnetTransactionInfo,
} from "../../src/testnet/contracts";
import type { ZodType } from "zod";
import type { TestnetServerConfig } from "./config";
import { ApiFailure } from "./http";

export interface ZcashTestnetGateway {
  health(): Promise<TestnetHealth>;
  createPaymentChallenge(input: CreatePaymentChallengeInput): Promise<PaymentChallenge>;
  getPaymentChallengeStatus(challengeId: string): Promise<PaymentChallengeStatus>;
  verifyPayment(challengeId: string): Promise<PaymentVerification>;
  getTransaction(txid: string): Promise<TestnetTransactionInfo>;
}

function parseGatewayResponse<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiFailure(
      502,
      "INVALID_GATEWAY_RESPONSE",
      "The real testnet gateway returned data outside the trusted contract.",
    );
  }
  return parsed.data;
}

const testnetPrefixes = ["utest1", "zutest1", "tutest1", "ztestsapling1", "textest1", "tm", "t2"];

export function hasTestnetAddressPrefix(recipient: string): boolean {
  const normalized = recipient.toLowerCase();
  return testnetPrefixes.some((prefix) => normalized.startsWith(prefix));
}

export function assertPrivateZip321Request(
  paymentUri: string,
  expectedRecipient: string,
  expectedAmount: string,
): void {
  if (!paymentUri.startsWith("zcash:")) {
    throw new ApiFailure(502, "INVALID_PAYMENT_URI", "Gateway returned a non-ZIP-321 payment URI.");
  }
  const [target, rawQuery = ""] = paymentUri.slice("zcash:".length).split("?", 2);
  const parameters = new URLSearchParams(rawQuery);
  const recipient = target || parameters.get("address") || "";
  if (target.length === 0
    || recipient !== expectedRecipient
    || parameters.getAll("amount").length !== 1
    || parameters.get("amount") !== expectedAmount) {
    throw new ApiFailure(502, "PAYMENT_REQUEST_MISMATCH", "Payment URI does not match its challenge.");
  }
  for (const key of parameters.keys()) {
    if (key !== "amount") {
      throw new ApiFailure(502, "PAYMENT_METADATA_FORBIDDEN", "ZITY payment requests must not include metadata.");
    }
  }
  if (!hasTestnetAddressPrefix(recipient)) {
    throw new ApiFailure(502, "MAINNET_DESTINATION_REJECTED", "Gateway did not return a recognizable testnet receiver.");
  }
}

function expectedUnlockEligibility(status: PaymentChallengeStatus, config: TestnetServerConfig): boolean {
  if (!status.transaction) return false;
  if (config.unlockPolicy === "detected") {
    return ["detected", "confirming", "verified"].includes(status.state);
  }
  return status.state === "verified" && status.confirmations >= config.minConfirmations;
}

function assertTransactionState(
  state: PaymentChallengeStatus["state"],
  transaction: TestnetTransactionInfo | null,
  requiredConfirmations: number,
  reportedConfirmations?: number,
): void {
  const confirmations = transaction?.confirmations ?? 0;
  if (reportedConfirmations !== undefined && reportedConfirmations !== confirmations) {
    throw new ApiFailure(502, "CONFIRMATION_MISMATCH", "Gateway returned inconsistent confirmation counts.");
  }

  if (state === "not-created" || state === "creating") {
    throw new ApiFailure(502, "INVALID_GATEWAY_STATE", "Gateway returned a client-only payment state.");
  }
  if (state === "payment-request-created" || state === "waiting") {
    if (transaction || confirmations !== 0) {
      throw new ApiFailure(502, "UNEXPECTED_TRANSACTION", "Gateway attached a transaction before detection.");
    }
    return;
  }
  if (state === "detected") {
    if (!transaction
      || confirmations !== 0
      || transaction.blockHeight !== null
      || transaction.confirmedAt != null) {
      throw new ApiFailure(502, "INVALID_DETECTION_STATE", "Detected payment data was labeled as confirmed.");
    }
    return;
  }
  if (state === "confirming") {
    if (!transaction
      || confirmations < 1
      || confirmations >= requiredConfirmations
      || transaction.blockHeight === null
      || transaction.confirmedAt != null) {
      throw new ApiFailure(502, "INVALID_CONFIRMING_STATE", "Gateway returned an inconsistent confirming transaction.");
    }
    return;
  }
  if (state === "verified") {
    if (!transaction
      || confirmations < requiredConfirmations
      || transaction.blockHeight === null
      || transaction.confirmedAt == null) {
      throw new ApiFailure(502, "INVALID_CONFIRMED_STATE", "Gateway did not prove the configured confirmation threshold.");
    }
  }
}

export class HttpZcashTestnetGateway implements ZcashTestnetGateway {
  constructor(private readonly config: TestnetServerConfig) {}

  async health(): Promise<TestnetHealth> {
    const health = parseGatewayResponse(testnetHealthSchema, await this.request("/v1/health"));
    if (health.network !== "testnet" || health.providerMode !== "real") {
      throw new ApiFailure(502, "GATEWAY_NOT_REAL_TESTNET", "Gateway did not identify itself as a real testnet provider.");
    }
    return health;
  }

  async createPaymentChallenge(input: CreatePaymentChallengeInput): Promise<PaymentChallenge> {
    const health = await this.health();
    if (!health.connected || !health.synced || !health.walletAvailable || !health.indexerAvailable) {
      throw new ApiFailure(503, "TESTNET_NOT_READY", "The real testnet wallet stack is not ready.", true);
    }
    const challenge = parseGatewayResponse(paymentChallengeSchema, await this.request("/v1/payment-challenges", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        network: "testnet",
        amount: this.config.paymentAmount,
        minConfirmations: this.config.minConfirmations,
        ttlSeconds: this.config.challengeTtlSeconds,
        unlockPolicy: this.config.unlockPolicy,
        freshReceiver: true,
      }),
    }));
    if (challenge.amount !== this.config.paymentAmount) {
      throw new ApiFailure(502, "PAYMENT_AMOUNT_MISMATCH", "Gateway changed the configured payment amount.");
    }
    assertPrivateZip321Request(challenge.paymentUri, challenge.recipient, challenge.amount);
    return challenge;
  }

  async getPaymentChallengeStatus(challengeId: string): Promise<PaymentChallengeStatus> {
    const status = parseGatewayResponse(
      paymentChallengeStatusSchema,
      await this.request(`/v1/payment-challenges/${encodeURIComponent(challengeId)}`),
    );
    if (status.challengeId !== challengeId || status.amount !== this.config.paymentAmount) {
      throw new ApiFailure(502, "CHALLENGE_MISMATCH", "Gateway returned status for a different challenge.");
    }
    assertTransactionState(
      status.state,
      status.transaction,
      this.config.minConfirmations,
      status.confirmations,
    );
    if (status.requiredConfirmations !== this.config.minConfirmations
      || status.unlockPolicy !== this.config.unlockPolicy
      || status.unlockEligible !== expectedUnlockEligibility(status, this.config)) {
      throw new ApiFailure(502, "INVALID_UNLOCK_STATE", "Gateway unlock state does not satisfy the configured policy.");
    }
    return status;
  }

  async verifyPayment(challengeId: string): Promise<PaymentVerification> {
    const verification = parseGatewayResponse(
      paymentVerificationSchema,
      await this.request(`/v1/payment-challenges/${encodeURIComponent(challengeId)}/verify`, { method: "POST" }),
    );
    if (verification.challengeId !== challengeId || verification.unlockPolicy !== this.config.unlockPolicy) {
      throw new ApiFailure(502, "VERIFICATION_MISMATCH", "Gateway returned a mismatched verification result.");
    }
    assertTransactionState(
      verification.state,
      verification.transaction,
      this.config.minConfirmations,
    );
    const eligible = verification.unlockPolicy === "detected"
      ? ["detected", "confirming", "verified"].includes(verification.state)
      : verification.state === "verified"
        && (verification.transaction?.confirmations ?? 0) >= this.config.minConfirmations;
    if (verification.unlockEligible !== eligible || verification.verified !== (verification.state === "verified")) {
      throw new ApiFailure(502, "INVALID_VERIFICATION", "Gateway returned an inconsistent verification result.");
    }
    return verification;
  }

  async getTransaction(txid: string): Promise<TestnetTransactionInfo> {
    const transaction = parseGatewayResponse(
      testnetTransactionInfoSchema,
      await this.request(`/v1/transactions/${encodeURIComponent(txid)}`),
    );
    if (transaction.txid.toLowerCase() !== txid.toLowerCase()) {
      throw new ApiFailure(502, "TRANSACTION_MISMATCH", "Gateway returned a different transaction.");
    }
    return transaction;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.gatewayTimeoutMs);
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("x-zity-network", "testnet");
    headers.set("authorization", `Bearer ${this.config.gatewayToken}`);

    try {
      const response = await fetch(`${this.config.gatewayUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ApiFailure(
          response.status >= 500 ? 503 : 502,
          response.status === 401 || response.status === 403 ? "GATEWAY_AUTH_ERROR" : "GATEWAY_REQUEST_FAILED",
          "The real testnet gateway rejected the request.",
          response.status >= 500,
          `Upstream HTTP ${response.status}`,
        );
      }
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiFailure(504, "GATEWAY_TIMEOUT", "The real testnet gateway timed out.", true);
      }
      throw new ApiFailure(503, "TESTNET_CONNECTION_UNAVAILABLE", "The real testnet gateway is unavailable.", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function realTestnetGateway(config: TestnetServerConfig): ZcashTestnetGateway {
  return new HttpZcashTestnetGateway(config);
}

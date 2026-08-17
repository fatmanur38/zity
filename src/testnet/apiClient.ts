import {
  apiErrorSchema,
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
} from "./contracts";
import type { ZodType } from "zod";

export class TestnetApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly details?: string,
  ) {
    super(message);
  }
}

export interface ZityTestnetApi {
  health(): Promise<TestnetHealth>;
  createPaymentChallenge(input: CreatePaymentChallengeInput): Promise<PaymentChallenge>;
  getPaymentChallengeStatus(challengeId: string): Promise<PaymentChallengeStatus>;
  verifyPayment(challengeId: string): Promise<PaymentVerification>;
  getTransaction(txid: string): Promise<TestnetTransactionInfo>;
}

function parseApiResponse<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new TestnetApiError(
      "INVALID_API_RESPONSE",
      "The testnet service returned data outside the trusted contract.",
      false,
      502,
    );
  }
  return parsed.data;
}

export class HttpZityTestnetApi implements ZityTestnetApi {
  constructor(
    private readonly baseUrl = "/api/testnet",
    private readonly timeoutMs = 10_000,
  ) {}

  async health(): Promise<TestnetHealth> {
    return parseApiResponse(testnetHealthSchema, await this.request("/health"));
  }

  async createPaymentChallenge(input: CreatePaymentChallengeInput): Promise<PaymentChallenge> {
    return parseApiResponse(paymentChallengeSchema, await this.request("/payment-challenge", {
      method: "POST",
      body: JSON.stringify(input),
    }));
  }

  async getPaymentChallengeStatus(challengeId: string): Promise<PaymentChallengeStatus> {
    return parseApiResponse(
      paymentChallengeStatusSchema,
      await this.request(`/payment-challenge/${encodeURIComponent(challengeId)}`),
    );
  }

  async verifyPayment(challengeId: string): Promise<PaymentVerification> {
    return parseApiResponse(
      paymentVerificationSchema,
      await this.request(`/payment-challenge/${encodeURIComponent(challengeId)}/verify`, { method: "POST" }),
    );
  }

  async getTransaction(txid: string): Promise<TestnetTransactionInfo> {
    return parseApiResponse(
      testnetTransactionInfoSchema,
      await this.request(`/transaction/${encodeURIComponent(txid)}`),
    );
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json", ...init.headers },
        signal: controller.signal,
      });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        const parsed = apiErrorSchema.safeParse(payload);
        if (parsed.success) {
          throw new TestnetApiError(
            parsed.data.error.code,
            parsed.data.error.message,
            parsed.data.error.retryable,
            response.status,
            parsed.data.error.details,
          );
        }
        throw new TestnetApiError(
          "INVALID_ERROR_RESPONSE",
          "The testnet service returned an invalid error response.",
          false,
          response.status,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof TestnetApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new TestnetApiError("REQUEST_TIMEOUT", "The testnet service did not respond in time.", true, 504);
      }
      throw new TestnetApiError("NETWORK_ERROR", "The testnet service is unavailable.", true, 503);
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

export const testnetApi = new HttpZityTestnetApi();

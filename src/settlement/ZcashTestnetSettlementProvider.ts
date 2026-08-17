import type {
  PaymentInput,
  PaymentResult,
  PaymentStatus,
  PaymentVerification,
  SettlementProvider,
} from "./types";

/**
 * Thin adapter for an operator-controlled service. It never sends player identity
 * fields and is not used unless VITE_SETTLEMENT_MODE=zcash-testnet is explicit.
 */
export class ZcashTestnetSettlementProvider implements SettlementProvider {
  constructor(private readonly endpoint: string) {
    if (!endpoint) throw new Error("A Zcash testnet adapter URL is required");
  }

  async createPayment(input: PaymentInput): Promise<PaymentResult> {
    return this.request<PaymentResult>("/payments", { method: "POST", body: JSON.stringify(input) });
  }

  async verifyPayment(id: string): Promise<PaymentVerification> {
    return this.request<PaymentVerification>(`/payments/${encodeURIComponent(id)}/verify`);
  }

  async getStatus(id: string): Promise<PaymentStatus> {
    const result = await this.request<{ status: PaymentStatus }>(`/payments/${encodeURIComponent(id)}`);
    return result.status;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    if (!response.ok) throw new Error(`Settlement adapter failed with ${response.status}`);
    return response.json() as Promise<T>;
  }
}

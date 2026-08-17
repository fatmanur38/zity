import type {
  PaymentInput,
  PaymentResult,
  PaymentStatus,
  PaymentVerification,
  SettlementProvider,
} from "./types";

export class MockSettlementProvider implements SettlementProvider {
  private readonly payments = new Map<string, PaymentResult>();

  async createPayment(_input: PaymentInput): Promise<PaymentResult> {
    const id = `mock-${crypto.randomUUID()}`;
    const result: PaymentResult = { id, status: "confirmed", simulated: true };
    this.payments.set(id, result);
    return result;
  }

  async verifyPayment(id: string): Promise<PaymentVerification> {
    return {
      valid: this.payments.get(id)?.status === "confirmed",
      confirmedAt: this.payments.has(id) ? new Date().toISOString() : undefined,
    };
  }

  async getStatus(id: string): Promise<PaymentStatus> {
    return this.payments.get(id)?.status ?? "failed";
  }
}

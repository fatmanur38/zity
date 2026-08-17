export type PaymentInput = {
  amount: number;
  currency: "TRY" | "USD";
  purpose: string;
};

export type PaymentResult = {
  id: string;
  status: "pending" | "confirmed" | "failed";
  simulated: boolean;
};

export type PaymentVerification = {
  valid: boolean;
  confirmedAt?: string;
};

export type PaymentStatus = PaymentResult["status"];

export interface SettlementProvider {
  createPayment(input: PaymentInput): Promise<PaymentResult>;
  verifyPayment(id: string): Promise<PaymentVerification>;
  getStatus(id: string): Promise<PaymentStatus>;
}

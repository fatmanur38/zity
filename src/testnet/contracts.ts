import { z } from "zod";

export const networkModeSchema = z.enum(["demo", "testnet"]);
export type NetworkMode = z.infer<typeof networkModeSchema>;

export const providerModeSchema = z.enum(["mock", "real"]);
export type ProviderMode = z.infer<typeof providerModeSchema>;

export const unlockPolicySchema = z.enum(["detected", "confirmed"]);
export type TestnetUnlockPolicy = z.infer<typeof unlockPolicySchema>;

export const testnetPaymentStateSchema = z.enum([
  "not-created",
  "creating",
  "payment-request-created",
  "waiting",
  "detected",
  "confirming",
  "verified",
  "expired",
  "failed",
  "network-error",
  "invalid-payment",
]);
export type TestnetPaymentState = z.infer<typeof testnetPaymentStateSchema>;

export const zecAmountSchema = z.string().regex(
  /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/,
  "Amount must be decimal ZEC with at most 8 fractional digits.",
).refine((amount) => {
  const numeric = Number(amount);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 21_000_000;
}, "Amount is outside the valid ZEC range.");

export const createPaymentChallengeInputSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{16,96}$/),
  purpose: z.literal("metro-access"),
}).strict();
export type CreatePaymentChallengeInput = z.infer<typeof createPaymentChallengeInputSchema>;

export const challengeIdSchema = z.string().uuid();

export const paymentChallengeSchema = z.object({
  challengeId: challengeIdSchema,
  network: z.literal("zcash-testnet"),
  providerMode: z.literal("real"),
  amount: zecAmountSchema,
  recipient: z.string().min(20).max(512),
  paymentUri: z.string().startsWith("zcash:").max(2048),
  expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }).optional(),
}).strict();
export type PaymentChallenge = z.infer<typeof paymentChallengeSchema>;

export const testnetTransactionInfoSchema = z.object({
  network: z.literal("zcash-testnet"),
  txid: z.string().regex(/^[a-fA-F0-9]{64}$/),
  confirmations: z.number().int().nonnegative(),
  blockHeight: z.number().int().nonnegative().nullable(),
  blockHash: z.string().regex(/^[a-fA-F0-9]{64}$/).nullable().optional(),
  detectedAt: z.string().datetime({ offset: true }),
  confirmedAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();
export type TestnetTransactionInfo = z.infer<typeof testnetTransactionInfoSchema>;

export const paymentChallengeStatusSchema = z.object({
  challengeId: challengeIdSchema,
  network: z.literal("zcash-testnet"),
  providerMode: z.literal("real"),
  state: testnetPaymentStateSchema,
  amount: zecAmountSchema,
  recipient: z.string().min(20).max(512),
  expiresAt: z.string().datetime({ offset: true }),
  confirmations: z.number().int().nonnegative(),
  requiredConfirmations: z.number().int().positive(),
  unlockPolicy: unlockPolicySchema,
  unlockEligible: z.boolean(),
  transaction: testnetTransactionInfoSchema.nullable(),
  errorCode: z.string().max(80).nullable().optional(),
  errorMessage: z.string().max(500).nullable().optional(),
}).strict();
export type PaymentChallengeStatus = z.infer<typeof paymentChallengeStatusSchema>;

export const paymentVerificationSchema = z.object({
  challengeId: challengeIdSchema,
  network: z.literal("zcash-testnet"),
  providerMode: z.literal("real"),
  state: testnetPaymentStateSchema,
  verified: z.boolean(),
  unlockEligible: z.boolean(),
  unlockPolicy: unlockPolicySchema,
  transaction: testnetTransactionInfoSchema.nullable(),
}).strict();
export type PaymentVerification = z.infer<typeof paymentVerificationSchema>;

export const testnetHealthSchema = z.object({
  network: z.literal("testnet"),
  providerMode: providerModeSchema,
  connected: z.boolean(),
  synced: z.boolean(),
  blockHeight: z.number().int().nonnegative().nullable(),
  walletAvailable: z.boolean(),
  indexerAvailable: z.boolean(),
  checkedAt: z.string().datetime({ offset: true }),
  message: z.string().max(500).optional(),
}).strict();
export type TestnetHealth = z.infer<typeof testnetHealthSchema>;

export const testnetEntitlementSchema = z.object({
  id: z.string().min(8).max(160),
  type: z.literal("metro-access"),
  source: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("demo") }).strict(),
    z.object({
      mode: z.literal("testnet"),
      challengeId: challengeIdSchema,
      txid: z.string().regex(/^[a-fA-F0-9]{64}$/),
    }).strict(),
  ]),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative().optional(),
  maxUses: z.literal(1),
  useCount: z.number().int().min(0).max(1),
}).strict();
export type TestnetEntitlement = z.infer<typeof testnetEntitlementSchema>;

export type TestnetEvent = {
  id: string;
  at: string;
  state: TestnetPaymentState;
  detail?: string;
  txid?: string;
};

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.string().optional(),
  }).strict(),
}).strict();
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;

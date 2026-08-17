import type {
  PaymentChallengeStatus,
  PaymentVerification,
  TestnetEntitlement,
  TestnetTransactionInfo,
} from "./contracts";
import type { MetroPaymentSession } from "./paymentMachine";

function sameTransaction(
  left: TestnetTransactionInfo | null,
  right: TestnetTransactionInfo | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.txid === right.txid
    && left.confirmations === right.confirmations
    && left.blockHeight === right.blockHeight
    && left.confirmedAt === right.confirmedAt;
}

export function shouldRefreshPaymentVerification(
  status: PaymentChallengeStatus,
  verification: PaymentVerification | null,
  entitlement: TestnetEntitlement | null,
): boolean {
  if (!status.unlockEligible) return false;
  if (entitlement && entitlement.useCount >= entitlement.maxUses) return false;
  if (!verification || !entitlement) return true;
  return verification.challengeId !== status.challengeId
    || verification.state !== status.state
    || verification.unlockPolicy !== status.unlockPolicy
    || !sameTransaction(verification.transaction, status.transaction);
}

export function selectFreshestMetroTransaction(
  payment: Pick<MetroPaymentSession, "status" | "verification">,
): TestnetTransactionInfo | null {
  const statusTransaction = payment.status?.transaction;
  const verifiedTransaction = payment.verification?.transaction;
  if (!statusTransaction) return verifiedTransaction ?? null;
  if (!verifiedTransaction) return statusTransaction;
  if (statusTransaction.confirmations !== verifiedTransaction.confirmations) {
    return statusTransaction.confirmations > verifiedTransaction.confirmations
      ? statusTransaction
      : verifiedTransaction;
  }
  return statusTransaction;
}

import { randomUUID } from "node:crypto";

import { AdapterError } from "./zallet-adapter.js";
import { createZip321Uri } from "./zip321.js";

const SESSION_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;
const TXID_PATTERN = /^[a-fA-F0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ServiceError extends Error {
  constructor(status, code, message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function adapterFailure(error) {
  if (error instanceof AdapterError) {
    return error;
  }
  return new AdapterError("ADAPTER_FAILURE", "The payment adapter failed closed.", { cause: error });
}

function validateCreateInput(input, config) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ServiceError(400, "INVALID_REQUEST", "A JSON request object is required.");
  }
  const allowedKeys = new Set([
    "sessionId",
    "purpose",
    "network",
    "amount",
    "minConfirmations",
    "ttlSeconds",
    "unlockPolicy",
    "freshReceiver",
  ]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new ServiceError(400, "INVALID_REQUEST", "Unknown payment challenge fields are not accepted.");
  }
  if (typeof input.sessionId !== "string" || !SESSION_PATTERN.test(input.sessionId)) {
    throw new ServiceError(400, "INVALID_SESSION", "sessionId is invalid.");
  }
  if (input.purpose !== "metro-access") {
    throw new ServiceError(400, "INVALID_PURPOSE", "Only the metro-access purpose is supported.");
  }
  if (input.network !== "testnet") {
    throw new ServiceError(400, "NETWORK_MISMATCH", "The requested network must be testnet.");
  }
  if (input.amount !== config.amount) {
    throw new ServiceError(400, "PAYMENT_AMOUNT_MISMATCH", "The requested amount does not match gateway configuration.");
  }
  if (input.minConfirmations !== config.minConfirmations) {
    throw new ServiceError(400, "CONFIRMATION_POLICY_MISMATCH", "The confirmation requirement does not match gateway configuration.");
  }
  if (input.ttlSeconds !== config.challengeTtlSeconds) {
    throw new ServiceError(400, "TTL_MISMATCH", "The challenge TTL does not match gateway configuration.");
  }
  if (input.unlockPolicy !== config.unlockPolicy) {
    throw new ServiceError(400, "UNLOCK_POLICY_MISMATCH", "The unlock policy does not match gateway configuration.");
  }
  if (input.freshReceiver !== true) {
    throw new ServiceError(400, "FRESH_RECEIVER_REQUIRED", "A fresh receiver is mandatory.");
  }
}

function publicTransaction(challenge) {
  if (!challenge.payment) return null;
  return {
    network: "zcash-testnet",
    txid: challenge.payment.txid,
    confirmations: challenge.payment.confirmations,
    blockHeight: challenge.payment.blockHeight,
    ...(challenge.payment.blockHash ? { blockHash: challenge.payment.blockHash } : {}),
    detectedAt: challenge.detectedAt,
    confirmedAt: challenge.confirmedAt,
  };
}

function computeState(challenge, now, failure) {
  if (failure?.code === "TRANSACTION_REJECTED") return "invalid-payment";
  if (failure) return "network-error";
  if (challenge.payment) {
    if (challenge.payment.confirmations >= challenge.requiredConfirmations) return "verified";
    if (challenge.payment.confirmations > 0) return "confirming";
    return "detected";
  }
  if (now >= challenge.expiresAtMs) return "expired";
  if (challenge.wrongAmountSeen) return "invalid-payment";
  return "waiting";
}

function unlockEligible(state, policy) {
  return policy === "detected"
    ? state === "detected" || state === "confirming" || state === "verified"
    : state === "verified";
}

export class ChallengeService {
  constructor({ adapter, config, now = () => Date.now(), createId = () => randomUUID() }) {
    this.adapter = adapter;
    this.config = config;
    this.now = now;
    this.createId = createId;
    this.challenges = new Map();
    this.recipientOwners = new Map();
    this.transactionOwners = new Map();
    this.creationTail = Promise.resolve();
  }

  health() {
    return this.adapter.health();
  }

  createPaymentChallenge(input) {
    const task = async () => this.createPaymentChallengeSerialized(input);
    const result = this.creationTail.then(task, task);
    this.creationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async createPaymentChallengeSerialized(input) {
    validateCreateInput(input, this.config);
    const now = this.now();
    this.cleanup(now);
    if (this.challenges.size >= this.config.maxChallenges) {
      throw new ServiceError(503, "IN_MEMORY_CAPACITY_REACHED", "The in-memory challenge limit was reached.", {
        retryable: true,
      });
    }

    let fresh;
    try {
      fresh = await this.adapter.createFreshReceiver();
    } catch (error) {
      const failure = adapterFailure(error);
      throw new ServiceError(503, failure.code, failure.message, { retryable: failure.retryable, cause: failure });
    }
    if (this.recipientOwners.has(fresh.recipient)) {
      throw new ServiceError(503, "FRESH_RECEIVER_REUSED", "Zallet reused a receiver; challenge creation was refused.");
    }

    const challengeId = this.createId();
    if (typeof challengeId !== "string" || !UUID_PATTERN.test(challengeId)) {
      throw new ServiceError(500, "CHALLENGE_ID_INVALID", "The challenge ID generator returned an invalid value.");
    }
    const createdAt = new Date(now).toISOString();
    const expiresAtMs = now + this.config.challengeTtlSeconds * 1_000;
    const challenge = {
      challengeId,
      amount: this.config.amount,
      amountZatoshis: this.config.amountZatoshis,
      recipient: fresh.recipient,
      receiverForms: [...fresh.receiverForms],
      startHeight: fresh.startHeight,
      createdAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      requiredConfirmations: this.config.minConfirmations,
      unlockPolicy: this.config.unlockPolicy,
      wrongAmountSeen: false,
      payment: null,
      detectedAt: null,
      confirmedAt: null,
    };
    this.challenges.set(challengeId, challenge);
    this.recipientOwners.set(challenge.recipient, challengeId);

    return {
      challengeId,
      network: "zcash-testnet",
      providerMode: "real",
      amount: challenge.amount,
      recipient: challenge.recipient,
      paymentUri: createZip321Uri(challenge.recipient, challenge.amount),
      expiresAt: challenge.expiresAt,
      createdAt: challenge.createdAt,
    };
  }

  async getPaymentChallengeStatus(challengeId) {
    const challenge = this.requireChallenge(challengeId);
    let failure = null;
    const now = this.now();
    if (challenge.payment || now < challenge.expiresAtMs) {
      try {
        const scan = await this.adapter.findPayment(challenge);
        challenge.wrongAmountSeen ||= scan.wrongAmountSeen;
        if (scan.payment) this.acceptPayment(challenge, scan.payment, now);
        else if (challenge.payment) this.clearPayment(challenge);
      } catch (error) {
        failure = adapterFailure(error);
        if (failure.code === "TRANSACTION_REJECTED") this.clearPayment(challenge);
      }
    }
    return this.buildStatus(challenge, now, failure);
  }

  async verifyPayment(challengeId) {
    const status = await this.getPaymentChallengeStatus(challengeId);
    return {
      challengeId: status.challengeId,
      network: "zcash-testnet",
      providerMode: "real",
      state: status.state,
      verified: status.state === "verified",
      unlockEligible: status.unlockEligible,
      unlockPolicy: status.unlockPolicy,
      transaction: status.transaction,
    };
  }

  async getTransaction(txid) {
    if (typeof txid !== "string" || !TXID_PATTERN.test(txid)) {
      throw new ServiceError(400, "INVALID_TXID", "txid must be 64 hexadecimal characters.");
    }
    const challengeId = this.transactionOwners.get(txid.toLowerCase());
    if (!challengeId) throw new ServiceError(404, "TRANSACTION_NOT_FOUND", "The transaction is not known to this process.");
    const status = await this.getPaymentChallengeStatus(challengeId);
    if (status.state === "network-error") {
      throw new ServiceError(503, status.errorCode ?? "NETWORK_ERROR", "Transaction refresh failed.", { retryable: true });
    }
    if (!status.transaction || status.transaction.txid.toLowerCase() !== txid.toLowerCase()) {
      throw new ServiceError(404, "TRANSACTION_NOT_FOUND", "The transaction is no longer attached to the challenge.");
    }
    return status.transaction;
  }

  requireChallenge(challengeId) {
    if (typeof challengeId !== "string" || !UUID_PATTERN.test(challengeId)) {
      throw new ServiceError(400, "INVALID_CHALLENGE_ID", "challengeId is invalid.");
    }
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw new ServiceError(404, "CHALLENGE_NOT_FOUND", "The challenge is not known to this process.");
    return challenge;
  }

  acceptPayment(challenge, payment, now) {
    const txid = payment.txid.toLowerCase();
    const owner = this.transactionOwners.get(txid);
    if (owner && owner !== challenge.challengeId) {
      throw new AdapterError("TRANSACTION_REUSE_REJECTED", "A transaction cannot satisfy two challenges.");
    }
    if (!challenge.payment && now >= challenge.expiresAtMs) return;
    if (challenge.payment && challenge.payment.txid !== txid) {
      throw new AdapterError("CHALLENGE_TRANSACTION_CHANGED", "A challenge cannot switch transactions.");
    }
    if (!challenge.detectedAt) challenge.detectedAt = new Date(now).toISOString();
    challenge.payment = { ...payment, txid };
    this.transactionOwners.set(txid, challenge.challengeId);
    if (payment.confirmations >= challenge.requiredConfirmations && !challenge.confirmedAt) {
      challenge.confirmedAt = new Date(now).toISOString();
    } else if (payment.confirmations < challenge.requiredConfirmations) {
      challenge.confirmedAt = null;
    }
  }

  clearPayment(challenge) {
    if (challenge.payment) this.transactionOwners.delete(challenge.payment.txid);
    challenge.payment = null;
    challenge.detectedAt = null;
    challenge.confirmedAt = null;
  }

  buildStatus(challenge, now, failure) {
    const state = computeState(challenge, now, failure);
    const statusError = failure
      ? {
          errorCode: failure.code.slice(0, 80),
          errorMessage: failure.message.slice(0, 500),
        }
      : state === "invalid-payment" && challenge.wrongAmountSeen
        ? {
            errorCode: "INCORRECT_AMOUNT",
            errorMessage: "A payment was detected for this receiver, but its amount did not exactly match the challenge.",
          }
        : null;
    return {
      challengeId: challenge.challengeId,
      network: "zcash-testnet",
      providerMode: "real",
      state,
      amount: challenge.amount,
      recipient: challenge.recipient,
      expiresAt: challenge.expiresAt,
      confirmations: challenge.payment?.confirmations ?? 0,
      requiredConfirmations: challenge.requiredConfirmations,
      unlockPolicy: challenge.unlockPolicy,
      unlockEligible: unlockEligible(state, challenge.unlockPolicy),
      transaction: publicTransaction(challenge),
      ...(statusError ?? {}),
    };
  }

  cleanup(now) {
    const removeBefore = now - this.config.retentionSeconds * 1_000;
    for (const [challengeId, challenge] of this.challenges) {
      if (challenge.expiresAtMs >= removeBefore) continue;
      this.challenges.delete(challengeId);
      this.recipientOwners.delete(challenge.recipient);
      if (challenge.payment) this.transactionOwners.delete(challenge.payment.txid);
    }
  }
}

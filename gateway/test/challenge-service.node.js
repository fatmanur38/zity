import test from "node:test";
import assert from "node:assert/strict";

import { ChallengeService } from "../src/challenge-service.js";
import { AdapterError } from "../src/zallet-adapter.js";

const txid = "c".repeat(64);
const blockHash = "d".repeat(64);

function config(overrides = {}) {
  return {
    amount: "0.001",
    amountZatoshis: 100_000n,
    minConfirmations: 2,
    challengeTtlSeconds: 600,
    unlockPolicy: "confirmed",
    maxChallenges: 100,
    retentionSeconds: 3_600,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    sessionId: "session_1234567890",
    purpose: "metro-access",
    network: "testnet",
    amount: "0.001",
    minConfirmations: 2,
    ttlSeconds: 600,
    unlockPolicy: "confirmed",
    freshReceiver: true,
    ...overrides,
  };
}

function fakeAdapter() {
  let receiverIndex = 0;
  return {
    scan: { wrongAmountSeen: false, payment: null },
    async health() {
      return {
        network: "testnet",
        providerMode: "real",
        connected: true,
        synced: true,
        blockHeight: 2_900_000,
        walletAvailable: true,
        indexerAvailable: true,
        checkedAt: new Date(0).toISOString(),
      };
    },
    async createFreshReceiver() {
      receiverIndex += 1;
      const recipient = `utest1${String(receiverIndex).padStart(4, "0")}${"q".repeat(80)}`;
      return {
        recipient,
        receiverForms: [recipient, `ztestsapling1${String(receiverIndex).padStart(4, "0")}${"q".repeat(60)}`],
        startHeight: 2_900_000,
      };
    },
    async findPayment() {
      return this.scan;
    },
  };
}

test("creates an exact ZIP-321 request without memo or identifying metadata", async () => {
  const adapter = fakeAdapter();
  const service = new ChallengeService({ adapter, config: config(), now: () => 1_700_000_000_000, createId: () => "00000000-0000-4000-8000-000000000001" });
  const challenge = await service.createPaymentChallenge(input());

  assert.equal(challenge.amount, "0.001");
  assert.equal(challenge.network, "zcash-testnet");
  assert.equal(challenge.providerMode, "real");
  assert.equal(challenge.paymentUri, `zcash:${challenge.recipient}?amount=0.001`);
  assert.doesNotMatch(challenge.paymentUri, /memo|message|label|session/i);
});

test("separates mempool detection, confirmations, and verified state", async () => {
  let now = 1_700_000_000_000;
  const adapter = fakeAdapter();
  const service = new ChallengeService({ adapter, config: config(), now: () => now, createId: () => "00000000-0000-4000-8000-000000000002" });
  const challenge = await service.createPaymentChallenge(input());

  adapter.scan = {
    wrongAmountSeen: false,
    payment: { txid, confirmations: 0, blockHeight: null },
  };
  let status = await service.getPaymentChallengeStatus(challenge.challengeId);
  assert.equal(status.state, "detected");
  assert.equal(status.unlockEligible, false);
  assert.equal(status.transaction.confirmations, 0);

  now += 1_000;
  adapter.scan.payment = { txid, confirmations: 1, blockHeight: 2_900_001, blockHash };
  status = await service.getPaymentChallengeStatus(challenge.challengeId);
  assert.equal(status.state, "confirming");
  assert.equal(status.unlockEligible, false);

  now += 1_000;
  adapter.scan.payment = { txid, confirmations: 2, blockHeight: 2_900_001, blockHash };
  const verification = await service.verifyPayment(challenge.challengeId);
  assert.equal(verification.state, "verified");
  assert.equal(verification.verified, true);
  assert.equal(verification.unlockEligible, true);
  assert.equal(verification.transaction.confirmedAt, new Date(now).toISOString());
});

test("detected policy is eligible before verification while verified remains false", async () => {
  const adapter = fakeAdapter();
  const detectedConfig = config({ minConfirmations: 1, unlockPolicy: "detected" });
  const service = new ChallengeService({ adapter, config: detectedConfig, createId: () => "00000000-0000-4000-8000-000000000003" });
  const challenge = await service.createPaymentChallenge(input({ minConfirmations: 1, unlockPolicy: "detected" }));
  adapter.scan = { wrongAmountSeen: false, payment: { txid, confirmations: 0, blockHeight: null } };

  const verification = await service.verifyPayment(challenge.challengeId);
  assert.equal(verification.state, "detected");
  assert.equal(verification.unlockEligible, true);
  assert.equal(verification.verified, false);
});

test("wrong amount is invalid and an unpaid challenge expires without fallback", async () => {
  let now = 1_700_000_000_000;
  const adapter = fakeAdapter();
  let scans = 0;
  adapter.findPayment = async () => {
    scans += 1;
    return { wrongAmountSeen: true, payment: null };
  };
  const service = new ChallengeService({ adapter, config: config(), now: () => now, createId: () => "00000000-0000-4000-8000-000000000004" });
  const challenge = await service.createPaymentChallenge(input());

  const invalid = await service.getPaymentChallengeStatus(challenge.challengeId);
  assert.equal(invalid.state, "invalid-payment");
  assert.equal(invalid.errorCode, "INCORRECT_AMOUNT");
  assert.equal(
    invalid.errorMessage,
    "A payment was detected for this receiver, but its amount did not exactly match the challenge.",
  );
  now += 601_000;
  assert.equal((await service.getPaymentChallengeStatus(challenge.challengeId)).state, "expired");
  assert.equal(scans, 1, "expired unpaid challenges must not keep scanning or invent a result");
});

test("rejects request policy drift instead of changing configured amount", async () => {
  const service = new ChallengeService({ adapter: fakeAdapter(), config: config() });
  await assert.rejects(service.createPaymentChallenge(input({ amount: "0.002" })), (error) => {
    assert.equal(error.code, "PAYMENT_AMOUNT_MISMATCH");
    assert.equal(error.status, 400);
    return true;
  });
});

test("revokes cached verification evidence on confirmation regression or disappearance", async () => {
  let now = 1_700_000_000_000;
  const adapter = fakeAdapter();
  const service = new ChallengeService({
    adapter,
    config: config(),
    now: () => now,
    createId: () => "00000000-0000-4000-8000-000000000005",
  });
  const challenge = await service.createPaymentChallenge(input());

  adapter.scan = {
    wrongAmountSeen: false,
    payment: { txid, confirmations: 2, blockHeight: 2_900_001, blockHash },
  };
  let status = await service.getPaymentChallengeStatus(challenge.challengeId);
  assert.equal(status.state, "verified");
  assert.ok(status.transaction.confirmedAt);

  now += 1_000;
  adapter.scan.payment = { txid, confirmations: 1, blockHeight: 2_900_001, blockHash };
  status = await service.getPaymentChallengeStatus(challenge.challengeId);
  assert.equal(status.state, "confirming");
  assert.equal(status.unlockEligible, false);
  assert.equal(status.transaction.confirmedAt, null);

  adapter.scan = { wrongAmountSeen: false, payment: null };
  status = await service.getPaymentChallengeStatus(challenge.challengeId);
  assert.equal(status.state, "waiting");
  assert.equal(status.transaction, null);
  await assert.rejects(service.getTransaction(txid), (error) => {
    assert.equal(error.status, 404);
    return true;
  });
});

test("maps a rejected transaction to a stable non-eligible invalid-payment status", async () => {
  const adapter = fakeAdapter();
  const service = new ChallengeService({
    adapter,
    config: config(),
    createId: () => "00000000-0000-4000-8000-000000000006",
  });
  const challenge = await service.createPaymentChallenge(input());

  adapter.scan = {
    wrongAmountSeen: false,
    payment: { txid, confirmations: 2, blockHeight: 2_900_001, blockHash },
  };
  assert.equal((await service.getPaymentChallengeStatus(challenge.challengeId)).state, "verified");

  adapter.findPayment = async () => {
    throw new AdapterError("TRANSACTION_REJECTED", "The candidate transaction was rejected and is not mineable.");
  };
  const rejected = await service.getPaymentChallengeStatus(challenge.challengeId);
  assert.equal(rejected.state, "invalid-payment");
  assert.equal(rejected.unlockEligible, false);
  assert.equal(rejected.transaction, null);
  assert.equal(rejected.errorCode, "TRANSACTION_REJECTED");
  assert.equal(rejected.errorMessage, "The candidate transaction was rejected and is not mineable.");
});

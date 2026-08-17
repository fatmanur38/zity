import test from "node:test";
import assert from "node:assert/strict";

import { AdapterError, ZalletTestnetAdapter } from "../src/zallet-adapter.js";

const accountUuid = "11111111-2222-4333-8444-555555555555";
const recipient = `utest1${"q".repeat(90)}`;
const saplingReceiver = `ztestsapling1${"q".repeat(70)}`;
const txid = "a".repeat(64);
const blockHash = "b".repeat(64);
const tipHeight = 2_900_002;
const transactionHeight = 2_900_001;

const zalletMethods = [
  "rpc.discover",
  "getwalletstatus",
  "z_getaccount",
  "z_getaddressforaccount",
  "z_listunifiedreceivers",
  "z_listtransactions",
  "z_viewtransaction",
];

function openRpc(title, methods) {
  return {
    openrpc: "1.3.2",
    info: { title, version: "0.1.0" },
    methods: methods.map((name) => ({ name })),
  };
}

class FixtureRpc {
  constructor(handlers) {
    this.handlers = handlers;
    this.calls = [];
  }

  async call(method, params = []) {
    this.calls.push({ method, params });
    const handler = this.handlers[method];
    if (typeof handler === "function") return handler(params);
    if (handler !== undefined) return handler;
    throw new Error(`Unexpected RPC call: ${method}`);
  }
}

function fixture({
  chain = "test",
  methods = zalletMethods,
  listTransactions = [],
  returnedAccountUuid = accountUuid,
  walletNodeBlockHashes = [blockHash],
  walletNodeHeight = tipHeight,
  walletHeight = walletNodeHeight,
  fullySyncedHeight = walletNodeHeight,
  walletBlockHashes = walletNodeBlockHashes,
  includeLocked = true,
  walletLocked = false,
  chainBlocks = tipHeight,
  zebraBlockHash = blockHash,
  zebraTransactionBlockHash = blockHash,
  viewConfirmations = 2,
} = {}) {
  let walletStatusCalls = 0;
  const zalletRpc = new FixtureRpc({
    "rpc.discover": openRpc("Zallet", methods),
    getwalletstatus: () => {
      const hashIndex = Math.min(walletStatusCalls, walletNodeBlockHashes.length - 1);
      const selectedNodeHash = walletNodeBlockHashes[hashIndex];
      const selectedWalletHash = walletBlockHashes[Math.min(walletStatusCalls, walletBlockHashes.length - 1)];
      walletStatusCalls += 1;
      return {
        node_tip: { height: walletNodeHeight, blockhash: selectedNodeHash },
        wallet_tip: { height: walletHeight, blockhash: selectedWalletHash },
        fully_synced_height: fullySyncedHeight,
        ...(includeLocked ? { locked: walletLocked } : {}),
      };
    },
    z_getaccount: { account_uuid: returnedAccountUuid, addresses: [] },
    z_getaddressforaccount: {
      account_uuid: accountUuid,
      diversifier_index: 123,
      receiver_types: ["sapling"],
      address: recipient,
    },
    z_listunifiedreceivers: { sapling: saplingReceiver },
    z_listtransactions: listTransactions,
    z_viewtransaction: {
      txid,
      status: "mined",
      confirmations: viewConfirmations,
      blockhash: blockHash,
      outputs: [{
        pool: "sapling",
        account_uuid: accountUuid,
        address: saplingReceiver,
        outgoing: false,
        walletInternal: false,
        valueZat: 100_000,
      }],
    },
  });
  const zebraRpc = new FixtureRpc({
    "rpc.discover": openRpc("Zebra JSON-RPC", ["rpc.discover", "getblockchaininfo", "getblockhash"]),
    getblockchaininfo: {
      chain,
      blocks: chainBlocks,
      headers: chainBlocks,
      verificationprogress: 1,
      initialblockdownload: false,
    },
    getblockhash: ([height]) => height === transactionHeight ? zebraTransactionBlockHash : zebraBlockHash,
  });
  const config = {
    accountUuid,
    receiverMatchValidated: true,
    zalletPageSize: 100,
    zalletMaxPages: 10,
  };
  return { adapter: new ZalletTestnetAdapter({ zalletRpc, zebraRpc, config }), zalletRpc, zebraRpc };
}

test("derives a fresh shielded-only testnet receiver", async () => {
  const { adapter, zalletRpc } = fixture();
  const fresh = await adapter.createFreshReceiver();

  assert.deepEqual(fresh, {
    recipient,
    receiverForms: [recipient, saplingReceiver],
    startHeight: tipHeight,
  });
  assert.deepEqual(
    zalletRpc.calls.find((call) => call.method === "z_getaddressforaccount")?.params,
    [accountUuid, ["sapling"]],
  );
});

test("requires chain === test and fails closed on mainnet", async () => {
  const { adapter } = fixture({ chain: "main" });
  await assert.rejects(adapter.createFreshReceiver(), (error) => {
    assert.ok(error instanceof AdapterError);
    assert.equal(error.code, "NETWORK_MISMATCH");
    return true;
  });
});

test("binds Zallet's wallet tip to the same-height Zebra block hash", async () => {
  const { adapter, zebraRpc } = fixture({ walletNodeBlockHashes: ["e".repeat(64)] });
  await assert.rejects(adapter.assertReady(), (error) => {
    assert.equal(error.code, "CHAIN_PROVENANCE_MISMATCH");
    return true;
  });
  assert.deepEqual(
    zebraRpc.calls.filter((call) => call.method === "getblockhash").map((call) => call.params),
    [[tipHeight], [tipHeight]],
  );
});

test("rejects a self-consistent but stale Zallet tip after one coordinated refresh", async () => {
  const { adapter, zalletRpc, zebraRpc } = fixture({ walletNodeHeight: tipHeight - 10 });

  await assert.rejects(adapter.assertReady(), (error) => {
    assert.equal(error.code, "WALLET_TIP_STALE");
    assert.equal(error.retryable, true);
    return true;
  });
  assert.equal(zalletRpc.calls.filter((call) => call.method === "getwalletstatus").length, 2);
  assert.equal(zebraRpc.calls.filter((call) => call.method === "getblockchaininfo").length, 2);
});

test("rechecks a fresh Zallet tip once to tolerate a concurrent reorg", async () => {
  const { adapter, zalletRpc } = fixture({ walletNodeBlockHashes: ["e".repeat(64), blockHash] });
  await adapter.assertReady();
  assert.equal(zalletRpc.calls.filter((call) => call.method === "getwalletstatus").length, 2);
});

test("probes the live OpenRPC document and rejects missing experimental methods", async () => {
  const { adapter } = fixture({ methods: zalletMethods.filter((method) => method !== "z_listtransactions") });
  await assert.rejects(adapter.assertReady(), (error) => {
    assert.equal(error.code, "RPC_CAPABILITY_MISSING");
    return true;
  });
});

test("readiness proves the configured account exists and matches", async () => {
  const { adapter, zalletRpc } = fixture({
    returnedAccountUuid: "99999999-8888-4777-8666-555555555555",
  });
  await assert.rejects(adapter.assertReady(), (error) => {
    assert.equal(error.code, "ACCOUNT_MISMATCH");
    return true;
  });
  assert.deepEqual(
    zalletRpc.calls.find((call) => call.method === "z_getaccount")?.params,
    [accountUuid],
  );
});

test("accepts beta.1 getwalletstatus without locked only when every tip signal is exact", async () => {
  const { adapter } = fixture({ includeLocked: false });
  const ready = await adapter.assertReady();
  assert.equal(ready.walletSynced, true);

  const { adapter: laggingAdapter } = fixture({
    includeLocked: false,
    walletHeight: tipHeight - 1,
    fullySyncedHeight: tipHeight - 1,
  });
  await assert.rejects(laggingAdapter.assertReady(), (error) => {
    assert.equal(error.code, "WALLET_NOT_SYNCED");
    return true;
  });
});

test("refuses readiness when getwalletstatus explicitly reports locked", async () => {
  const { adapter } = fixture({ walletLocked: true });
  await assert.rejects(adapter.assertReady(), (error) => {
    assert.equal(error.code, "WALLET_NOT_SYNCED");
    assert.equal(error.retryable, true);
    return true;
  });
});

test("proves exact receiver and amount with list + view before returning payment", async () => {
  const listed = [{
    account_uuid: accountUuid,
    mined_height: 2_900_001,
    txid,
    outputs: [
      {
        pool: "sapling",
        output_index: 0,
        from_account: accountUuid,
        to_account: null,
        to_address: `ztestsapling1${"p".repeat(70)}`,
        value: 10_000,
        is_change: false,
        memo: null,
      },
      {
        pool: "sapling",
        output_index: 1,
        from_account: null,
        to_account: accountUuid,
        to_address: recipient,
        value: 100_000,
        is_change: false,
        memo: null,
      },
    ],
  }];
  const { adapter } = fixture({ listTransactions: listed });
  const result = await adapter.findPayment({
    startHeight: 2_900_000,
    receiverForms: [recipient, saplingReceiver],
    amountZatoshis: 100_000n,
  });

  assert.deepEqual(result, {
    wrongAmountSeen: false,
    payment: {
      txid,
      confirmations: 2,
      blockHeight: 2_900_001,
      blockHash,
    },
  });
});

test("rejects a confirmed candidate whose block is not canonical in Zebra", async () => {
  const listed = [{
    account_uuid: accountUuid,
    mined_height: transactionHeight,
    txid,
    outputs: [{
      to_account: accountUuid,
      to_address: recipient,
      value: 100_000,
      is_change: false,
    }],
  }];
  const { adapter } = fixture({
    listTransactions: listed,
    zebraTransactionBlockHash: "f".repeat(64),
  });

  await assert.rejects(adapter.findPayment({
    startHeight: 2_900_000,
    receiverForms: [recipient, saplingReceiver],
    amountZatoshis: 100_000n,
  }), (error) => {
    assert.equal(error.code, "TRANSACTION_BLOCK_PROVENANCE_MISMATCH");
    assert.equal(error.retryable, true);
    return true;
  });
});

test("maps negative confirmations to a non-retryable rejected transaction", async () => {
  const listed = [{
    account_uuid: accountUuid,
    mined_height: null,
    txid,
    outputs: [{
      to_account: accountUuid,
      to_address: saplingReceiver,
      value: 100_000,
      is_change: false,
    }],
  }];
  const { adapter } = fixture({ listTransactions: listed, viewConfirmations: -1 });

  await assert.rejects(adapter.findPayment({
    startHeight: 2_900_000,
    receiverForms: [recipient, saplingReceiver],
    amountZatoshis: 100_000n,
  }), (error) => {
    assert.equal(error.code, "TRANSACTION_REJECTED");
    assert.equal(error.message, "The candidate transaction was rejected and is not mineable.");
    assert.equal(error.retryable, false);
    return true;
  });
});

test("reports a receiver-specific wrong amount without accepting it", async () => {
  const listed = [{
    account_uuid: accountUuid,
    mined_height: null,
    txid,
    outputs: [{
      to_account: accountUuid,
      to_address: saplingReceiver,
      value: 99_999,
      is_change: false,
    }],
  }];
  const { adapter } = fixture({ listTransactions: listed });
  const result = await adapter.findPayment({
    startHeight: 2_900_000,
    receiverForms: [recipient, saplingReceiver],
    amountZatoshis: 100_000n,
  });

  assert.deepEqual(result, { wrongAmountSeen: true, payment: null });
});

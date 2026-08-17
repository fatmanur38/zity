import { RpcError } from "./rpc-client.js";
import { isRecognizableTestnetRecipient } from "./zip321.js";

const TXID_PATTERN = /^[a-fA-F0-9]{64}$/;
const BLOCK_HASH_PATTERN = /^[a-fA-F0-9]{64}$/;
const REQUIRED_ZALLET_METHODS = [
  "rpc.discover",
  "getwalletstatus",
  "z_getaccount",
  "z_getaddressforaccount",
  "z_listunifiedreceivers",
  "z_listtransactions",
  "z_viewtransaction",
];
const REQUIRED_ZEBRA_METHODS = ["rpc.discover", "getblockchaininfo", "getblockhash"];

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function safeInteger(value, { nullable = false, nonnegative = true } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || (nonnegative && value < 0)) return undefined;
  return value;
}

export class AdapterError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = "AdapterError";
    this.code = code;
    this.retryable = retryable;
  }
}

function asAdapterError(error) {
  if (error instanceof AdapterError) return error;
  if (error instanceof RpcError) {
    return new AdapterError(error.code, error.message, { retryable: error.retryable, cause: error });
  }
  return new AdapterError("ADAPTER_FAILURE", "The Zcash adapter failed closed.", { cause: error });
}

function parseOpenRpc(document, expectedTitle, requiredMethods) {
  const value = record(document);
  const info = record(value?.info);
  if (!value || typeof value.openrpc !== "string" || !info || !Array.isArray(value.methods)) {
    throw new AdapterError("RPC_DISCOVERY_INVALID", "The RPC discovery document has an invalid shape.");
  }
  if (expectedTitle && info.title !== expectedTitle) {
    throw new AdapterError("RPC_IMPLEMENTATION_MISMATCH", `Expected ${expectedTitle} RPC capabilities.`);
  }
  const methods = new Set(
    value.methods.map((method) => record(method)?.name).filter((name) => typeof name === "string"),
  );
  const missing = requiredMethods.filter((method) => !methods.has(method));
  if (missing.length > 0) {
    throw new AdapterError("RPC_CAPABILITY_MISSING", `Required RPC capabilities are unavailable: ${missing.join(", ")}.`);
  }
  return {
    title: info.title,
    version: typeof info.version === "string" ? info.version : "unknown",
    methods,
  };
}

function parseWalletStatus(result) {
  const value = record(result);
  const nodeTip = record(value?.node_tip);
  const walletTip = record(value?.wallet_tip);
  const nodeHeight = safeInteger(nodeTip?.height);
  const walletHeight = safeInteger(walletTip?.height);
  const fullySyncedHeight = safeInteger(value?.fully_synced_height);
  const nodeBlockHash = typeof nodeTip?.blockhash === "string" ? nodeTip.blockhash.toLowerCase() : "";
  const walletBlockHash = typeof walletTip?.blockhash === "string" ? walletTip.blockhash.toLowerCase() : "";
  const locked = value?.locked;
  if (
    !value
    || nodeHeight === undefined
    || walletHeight === undefined
    || fullySyncedHeight === undefined
    || !BLOCK_HASH_PATTERN.test(nodeBlockHash)
    || !BLOCK_HASH_PATTERN.test(walletBlockHash)
    || (locked !== undefined && typeof locked !== "boolean")
  ) {
    throw new AdapterError("WALLET_STATUS_INVALID", "Zallet returned an incomplete wallet status.");
  }
  const tipsExactlySynced = walletHeight === nodeHeight
    && fullySyncedHeight === nodeHeight
    && walletBlockHash === nodeBlockHash;
  return {
    nodeHeight,
    nodeBlockHash,
    walletHeight,
    walletBlockHash,
    fullySyncedHeight,
    locked: locked === true,
    // Z3's pinned Zallet beta.1 omits `locked`. That omission is safe only
    // when every available wallet/node tip signal is already exact.
    synced: locked !== true && tipsExactlySynced,
  };
}

function parseConfiguredAccount(result, expectedAccountUuid) {
  const value = record(result);
  if (
    !value
    || typeof value.account_uuid !== "string"
    || value.account_uuid.toLowerCase() !== expectedAccountUuid
    || !Array.isArray(value.addresses)
  ) {
    throw new AdapterError(
      "ACCOUNT_MISMATCH",
      "The configured Zallet account UUID is unavailable or does not match the wallet response.",
    );
  }
  return value;
}

function parseChainInfo(result) {
  const value = record(result);
  const blocks = safeInteger(value?.blocks);
  if (!value || typeof value.chain !== "string" || blocks === undefined) {
    throw new AdapterError("CHAIN_STATUS_INVALID", "Zebra returned an incomplete chain status.");
  }
  if (value.chain !== "test") {
    throw new AdapterError("NETWORK_MISMATCH", "The backing chain must report chain === test.");
  }
  const headers = safeInteger(value.headers);
  const progress = typeof value.verificationprogress === "number" ? value.verificationprogress : undefined;
  const initialDownload = typeof value.initialblockdownload === "boolean"
    ? value.initialblockdownload
    : typeof value.initial_block_download_complete === "boolean"
      ? !value.initial_block_download_complete
      : undefined;
  const synced = (headers === undefined || blocks >= headers)
    && (progress === undefined || progress >= 0.999)
    && initialDownload !== true;
  return { blocks, synced };
}

function parseListedTransaction(value) {
  const tx = record(value);
  const minedHeight = safeInteger(tx?.mined_height, { nullable: true });
  if (
    !tx
    || typeof tx.account_uuid !== "string"
    || typeof tx.txid !== "string"
    || !TXID_PATTERN.test(tx.txid)
    || minedHeight === undefined
    || !Array.isArray(tx.outputs)
  ) {
    throw new AdapterError(
      "EXPERIMENTAL_RPC_SCHEMA_MISMATCH",
      "Zallet z_listtransactions no longer matches the validated response shape.",
    );
  }
  const outputs = tx.outputs.map((item) => {
    const output = record(item);
    if (
      !output
      || (output.to_account !== null && typeof output.to_account !== "string")
      || (output.to_address !== null && typeof output.to_address !== "string")
      || !Number.isSafeInteger(output.value)
      || output.value < 0
      || typeof output.is_change !== "boolean"
    ) {
      throw new AdapterError(
        "EXPERIMENTAL_RPC_SCHEMA_MISMATCH",
        "Zallet z_listtransactions output data no longer matches the validated response shape.",
      );
    }
    return output;
  });
  return { ...tx, txid: tx.txid.toLowerCase(), minedHeight, outputs };
}

function parseViewedTransaction(value, expectedTxid) {
  const view = record(value);
  if (
    !view
    || typeof view.txid !== "string"
    || view.txid.toLowerCase() !== expectedTxid
    || !Number.isSafeInteger(view.confirmations)
    || !Array.isArray(view.outputs)
  ) {
    throw new AdapterError("TRANSACTION_VIEW_INVALID", "Zallet returned an invalid transaction view.");
  }
  if (view.confirmations < 0) {
    throw new AdapterError("TRANSACTION_REJECTED", "The candidate transaction was rejected and is not mineable.");
  }
  if (view.confirmations > 0 && (typeof view.blockhash !== "string" || !BLOCK_HASH_PATTERN.test(view.blockhash))) {
    throw new AdapterError("TRANSACTION_BLOCK_INVALID", "A confirmed transaction omitted its block hash.");
  }
  return view;
}

export class ZalletTestnetAdapter {
  constructor({ zalletRpc, zebraRpc, config }) {
    this.zalletRpc = zalletRpc;
    this.zebraRpc = zebraRpc;
    this.config = config;
    this.capabilityCache = null;
  }

  async discoverCapabilities({ force = false } = {}) {
    const now = Date.now();
    if (!force && this.capabilityCache && this.capabilityCache.expiresAt > now) {
      return this.capabilityCache.value;
    }
    try {
      const [zalletDocument, zebraDocument] = await Promise.all([
        this.zalletRpc.call("rpc.discover"),
        this.zebraRpc.call("rpc.discover"),
      ]);
      const value = {
        zallet: parseOpenRpc(zalletDocument, "Zallet", REQUIRED_ZALLET_METHODS),
        zebra: parseOpenRpc(zebraDocument, null, REQUIRED_ZEBRA_METHODS),
      };
      this.capabilityCache = { expiresAt: now + 60_000, value };
      return value;
    } catch (error) {
      throw asAdapterError(error);
    }
  }

  async operationalStatus() {
    await this.discoverCapabilities();
    try {
      const [chainResult, walletResult, accountResult] = await Promise.all([
        this.zebraRpc.call("getblockchaininfo"),
        this.zalletRpc.call("getwalletstatus"),
        this.zalletRpc.call("z_getaccount", [this.config.accountUuid]),
      ]);
      const chain = parseChainInfo(chainResult);
      const wallet = parseWalletStatus(walletResult);
      parseConfiguredAccount(accountResult, this.config.accountUuid);
      const current = await this.assertCurrentWalletTip(chain, wallet);
      return {
        blockHeight: current.chain.blocks,
        connected: true,
        chainSynced: current.chain.synced,
        walletSynced: current.wallet.synced,
      };
    } catch (error) {
      throw asAdapterError(error);
    }
  }

  async assertCurrentWalletTip(initialChain, initialWallet) {
    let chain = initialChain;
    let wallet = initialWallet;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (wallet.nodeHeight === chain.blocks) {
        const boundWallet = await this.assertWalletChainProvenance(wallet);
        if (boundWallet.nodeHeight === chain.blocks) return { chain, wallet: boundWallet };
        wallet = boundWallet;
      }
      if (attempt === 0) {
        const [chainResult, walletResult] = await Promise.all([
          this.zebraRpc.call("getblockchaininfo"),
          this.zalletRpc.call("getwalletstatus"),
        ]);
        chain = parseChainInfo(chainResult);
        wallet = parseWalletStatus(walletResult);
      }
    }
    throw new AdapterError(
      "WALLET_TIP_STALE",
      "Zallet's node tip must match Zebra's current testnet tip after a coordinated refresh.",
      { retryable: true },
    );
  }

  async assertWalletChainProvenance(initialWallet) {
    let wallet = initialWallet;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const zebraHash = await this.zebraRpc.call("getblockhash", [wallet.nodeHeight]);
      if (typeof zebraHash !== "string" || !BLOCK_HASH_PATTERN.test(zebraHash)) {
        throw new AdapterError("CHAIN_PROVENANCE_INVALID", "Zebra returned an invalid block hash.");
      }
      if (zebraHash.toLowerCase() === wallet.nodeBlockHash) return wallet;
      if (attempt === 0) {
        wallet = parseWalletStatus(await this.zalletRpc.call("getwalletstatus"));
      }
    }
    throw new AdapterError(
      "CHAIN_PROVENANCE_MISMATCH",
      "Zallet's node tip is not part of the configured Zebra testnet chain.",
      { retryable: true },
    );
  }

  async health() {
    const checkedAt = new Date().toISOString();
    try {
      const status = await this.operationalStatus();
      const synced = status.chainSynced && status.walletSynced;
      const validated = this.config.receiverMatchValidated;
      return {
        network: "testnet",
        providerMode: "real",
        connected: true,
        synced,
        blockHeight: status.blockHeight,
        walletAvailable: true,
        indexerAvailable: validated,
        checkedAt,
        ...(!validated
          ? { message: "Receiver matching is disabled until a live Zallet testnet validation is acknowledged." }
          : !synced
            ? { message: "Zebra or Zallet is not fully synced." }
            : {}),
      };
    } catch (error) {
      const failure = asAdapterError(error);
      return {
        network: "testnet",
        providerMode: "real",
        connected: failure.code !== "RPC_UNAVAILABLE" && failure.code !== "RPC_TIMEOUT",
        synced: false,
        blockHeight: null,
        walletAvailable: false,
        indexerAvailable: false,
        checkedAt,
        message: `${failure.code}: ${failure.message}`.slice(0, 500),
      };
    }
  }

  async assertReady() {
    const status = await this.operationalStatus();
    if (!status.chainSynced || !status.walletSynced) {
      throw new AdapterError("WALLET_NOT_SYNCED", "Zebra and Zallet must both be fully synced.", { retryable: true });
    }
    if (!this.config.receiverMatchValidated) {
      throw new AdapterError(
        "LIVE_VALIDATION_REQUIRED",
        "Live receiver matching has not been validated for this Zallet release.",
      );
    }
    return status;
  }

  async createFreshReceiver() {
    const status = await this.assertReady();
    let derived;
    let receivers;
    try {
      derived = record(await this.zalletRpc.call("z_getaddressforaccount", [
        this.config.accountUuid,
        ["sapling"],
      ]));
      if (
        !derived
        || String(derived.account_uuid).toLowerCase() !== this.config.accountUuid
        || !Array.isArray(derived.receiver_types)
        || derived.receiver_types.length !== 1
        || derived.receiver_types[0] !== "sapling"
        || typeof derived.address !== "string"
        || !derived.address.toLowerCase().startsWith("utest1")
      ) {
        throw new AdapterError("FRESH_RECEIVER_INVALID", "Zallet did not return a Sapling-only testnet UA.");
      }
      receivers = record(await this.zalletRpc.call("z_listunifiedreceivers", [derived.address]));
      if (
        !receivers
        || typeof receivers.sapling !== "string"
        || !receivers.sapling.toLowerCase().startsWith("ztestsapling1")
        || receivers.p2pkh !== undefined
        || receivers.p2sh !== undefined
        || receivers.orchard !== undefined
      ) {
        throw new AdapterError("RECEIVER_DECOMPOSITION_INVALID", "The fresh UA is not exclusively Sapling shielded.");
      }
    } catch (error) {
      throw asAdapterError(error);
    }
    if (!isRecognizableTestnetRecipient(derived.address)) {
      throw new AdapterError("MAINNET_DESTINATION_REJECTED", "The wallet returned a non-testnet receiver.");
    }
    return {
      recipient: derived.address,
      receiverForms: [derived.address, receivers.sapling],
      startHeight: status.blockHeight,
    };
  }

  async findPayment(challenge) {
    await this.assertReady();
    const receiverForms = new Set(challenge.receiverForms);
    let wrongAmountSeen = false;
    let reachedScanLimit = false;

    try {
      for (let page = 0; page < this.config.zalletMaxPages; page += 1) {
        const offset = page * this.config.zalletPageSize;
        const result = await this.zalletRpc.call("z_listtransactions", [
          this.config.accountUuid,
          challenge.startHeight,
          null,
          offset,
          this.config.zalletPageSize,
        ]);
        if (!Array.isArray(result)) {
          throw new AdapterError(
            "EXPERIMENTAL_RPC_SCHEMA_MISMATCH",
            "Zallet z_listtransactions did not return an array.",
          );
        }
        const transactions = result.map(parseListedTransaction);
        for (const transaction of transactions) {
          if (transaction.account_uuid.toLowerCase() !== this.config.accountUuid) continue;
          const directedOutputs = transaction.outputs.filter((output) =>
            typeof output.to_account === "string"
              && output.to_account.toLowerCase() === this.config.accountUuid
              && output.is_change === false
              && receiverForms.has(output.to_address),
          );
          if (directedOutputs.length === 0) continue;
          if (!directedOutputs.some((output) => BigInt(output.value) === challenge.amountZatoshis)) {
            wrongAmountSeen = true;
            continue;
          }

          const view = parseViewedTransaction(
            await this.zalletRpc.call("z_viewtransaction", [transaction.txid]),
            transaction.txid,
          );
          const exactViewedOutput = view.outputs.some((item) => {
            const output = record(item);
            return output
              && String(output.account_uuid).toLowerCase() === this.config.accountUuid
              && output.outgoing === false
              && output.walletInternal === false
              && receiverForms.has(output.address)
              && Number.isSafeInteger(output.valueZat)
              && BigInt(output.valueZat) === challenge.amountZatoshis;
          });
          if (!exactViewedOutput) {
            throw new AdapterError(
              "RECEIVER_MATCH_UNPROVEN",
              "The transaction view did not prove the exact fresh receiver and amount.",
            );
          }
          if (view.confirmations > 0 && transaction.minedHeight === null) {
            throw new AdapterError("TRANSACTION_HEIGHT_INVALID", "A confirmed transaction omitted its mined height.");
          }
          if (view.confirmations > 0) {
            const canonicalBlockHash = await this.zebraRpc.call("getblockhash", [transaction.minedHeight]);
            if (typeof canonicalBlockHash !== "string" || !BLOCK_HASH_PATTERN.test(canonicalBlockHash)) {
              throw new AdapterError("TRANSACTION_BLOCK_INVALID", "Zebra returned an invalid transaction block hash.");
            }
            if (canonicalBlockHash.toLowerCase() !== view.blockhash.toLowerCase()) {
              throw new AdapterError(
                "TRANSACTION_BLOCK_PROVENANCE_MISMATCH",
                "The candidate transaction is not in Zebra's canonical block at its reported height.",
                { retryable: true },
              );
            }
          }
          return {
            wrongAmountSeen,
            payment: {
              txid: transaction.txid,
              confirmations: view.confirmations,
              blockHeight: transaction.minedHeight,
              ...(typeof view.blockhash === "string" ? { blockHash: view.blockhash.toLowerCase() } : {}),
            },
          };
        }
        if (transactions.length < this.config.zalletPageSize) {
          return { wrongAmountSeen, payment: null };
        }
        reachedScanLimit = true;
      }
    } catch (error) {
      throw asAdapterError(error);
    }

    if (reachedScanLimit) {
      throw new AdapterError(
        "TRANSACTION_SCAN_LIMIT",
        "The bounded Zallet transaction scan was exhausted without a conclusive result.",
        { retryable: true },
      );
    }
    return { wrongAmountSeen, payment: null };
  }
}

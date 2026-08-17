import { isAbsolute } from "node:path";

const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new ConfigError(`${name} is required.`);
  }
  return value;
}

function boolean(env, name, fallback = false) {
  const value = env[name];
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigError(`${name} must be either true or false.`);
}

function integer(env, name, fallback, minimum, maximum) {
  const raw = env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new ConfigError(`${name} must be an integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ConfigError(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function amountToZatoshis(amount) {
  if (typeof amount !== "string" || !AMOUNT_PATTERN.test(amount)) {
    throw new ConfigError("ZITY_PAYMENT_AMOUNT must be decimal ZEC with at most 8 fractional digits.");
  }
  const [whole, fraction = ""] = amount.split(".");
  const zatoshis = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
  if (zatoshis <= 0n || zatoshis > 2_100_000_000_000_000n) {
    throw new ConfigError("ZITY_PAYMENT_AMOUNT is outside the valid ZEC range.");
  }
  return zatoshis;
}

function rpcConfig(env, prefix, { credentialsRequired, cookieAllowed = false }) {
  const urlString = required(env, `${prefix}_RPC_URL`);
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new ConfigError(`${prefix}_RPC_URL must be a valid URL.`);
  }
  if (url.username || url.password) {
    throw new ConfigError(`${prefix}_RPC_URL must not contain credentials.`);
  }
  const insecureAllowed = boolean(env, "RPC_ALLOW_INSECURE_HTTP", false);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && insecureAllowed)) {
    throw new ConfigError(`${prefix}_RPC_URL must use HTTPS unless RPC_ALLOW_INSECURE_HTTP=true.`);
  }

  const username = env[`${prefix}_RPC_USER`];
  const password = env[`${prefix}_RPC_PASSWORD`];
  const cookieFile = cookieAllowed ? env[`${prefix}_RPC_COOKIE_FILE`] : undefined;
  if (Boolean(username) !== Boolean(password)) {
    throw new ConfigError(`${prefix}_RPC_USER and ${prefix}_RPC_PASSWORD must be set together.`);
  }
  if (cookieFile && (username || password)) {
    throw new ConfigError(`${prefix} RPC must use either a cookie file or explicit credentials, not both.`);
  }
  if (cookieFile && !isAbsolute(cookieFile)) {
    throw new ConfigError(`${prefix}_RPC_COOKIE_FILE must be an absolute path.`);
  }
  if (credentialsRequired && !cookieFile && (!username || !password)) {
    throw new ConfigError(`${prefix} RPC requires a cookie file or explicit user/password credentials.`);
  }

  return {
    url: url.toString(),
    username,
    password,
    cookieFile,
  };
}

export function readConfig(env = process.env) {
  if (required(env, "ZITY_GATEWAY_NETWORK") !== "testnet") {
    throw new ConfigError("ZITY_GATEWAY_NETWORK must be exactly testnet.");
  }

  const bearerToken = required(env, "GATEWAY_BEARER_TOKEN");
  const looksLikePlaceholder = /replace[-_ ]?me|change[-_ ]?me|placeholder|example/i.test(bearerToken)
    || new Set(bearerToken).size < 8;
  if (Buffer.byteLength(bearerToken) < 32 || looksLikePlaceholder) {
    throw new ConfigError("GATEWAY_BEARER_TOKEN must be at least 32 bytes and must not be a placeholder.");
  }

  const amount = env.ZITY_PAYMENT_AMOUNT ?? "0.001";
  const amountZatoshis = amountToZatoshis(amount);
  const unlockPolicy = env.ZITY_UNLOCK_POLICY ?? "confirmed";
  if (unlockPolicy !== "detected" && unlockPolicy !== "confirmed") {
    throw new ConfigError("ZITY_UNLOCK_POLICY must be detected or confirmed.");
  }

  const accountUuid = required(env, "ZALLET_ACCOUNT_UUID");
  if (!UUID_PATTERN.test(accountUuid)) {
    throw new ConfigError("ZALLET_ACCOUNT_UUID must be a UUID returned by Zallet.");
  }

  return {
    host: env.HOST || "0.0.0.0",
    port: integer(env, "PORT", 8787, 1, 65_535),
    bearerToken,
    network: "testnet",
    amount,
    amountZatoshis,
    minConfirmations: integer(env, "ZITY_MIN_CONFIRMATIONS", 1, 1, 100),
    challengeTtlSeconds: integer(env, "ZITY_CHALLENGE_TTL_SECONDS", 600, 60, 86_400),
    unlockPolicy,
    maxChallenges: integer(env, "ZITY_MAX_IN_MEMORY_CHALLENGES", 1_000, 1, 100_000),
    retentionSeconds: integer(env, "ZITY_EXPIRED_RETENTION_SECONDS", 3_600, 60, 604_800),
    rpcTimeoutMs: integer(env, "RPC_TIMEOUT_MS", 8_000, 250, 120_000),
    zalletPageSize: integer(env, "ZALLET_TRANSACTION_PAGE_SIZE", 100, 1, 1_000),
    zalletMaxPages: integer(env, "ZALLET_TRANSACTION_MAX_PAGES", 10, 1, 100),
    receiverMatchValidated: boolean(env, "ZITY_LIVE_RECEIVER_MATCH_VALIDATED", false),
    accountUuid: accountUuid.toLowerCase(),
    zalletRpc: rpcConfig(env, "ZALLET", { credentialsRequired: true }),
    zebraRpc: rpcConfig(env, "ZEBRA", { credentialsRequired: true, cookieAllowed: true }),
  };
}

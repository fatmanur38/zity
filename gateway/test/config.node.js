import test from "node:test";
import assert from "node:assert/strict";

import { readConfig } from "../src/config.js";

function environment(overrides = {}) {
  return {
    ZITY_GATEWAY_NETWORK: "testnet",
    GATEWAY_BEARER_TOKEN: "0123456789abcdef".repeat(4),
    ZALLET_ACCOUNT_UUID: "11111111-2222-4333-8444-555555555555",
    ZALLET_RPC_URL: "https://zallet.internal/",
    ZALLET_RPC_USER: "zallet-user",
    ZALLET_RPC_PASSWORD: "zallet-password",
    ZEBRA_RPC_URL: "https://zebra.internal/",
    ZEBRA_RPC_COOKIE_FILE: "/run/secrets/zebra-cookie",
    ...overrides,
  };
}

test("accepts an absolute Zebra cookie path without duplicating credentials", () => {
  const config = readConfig(environment());
  assert.equal(config.zebraRpc.cookieFile, "/run/secrets/zebra-cookie");
  assert.equal(config.zebraRpc.username, undefined);
});

test("requires Zebra cookie auth or an explicit user/password pair", () => {
  assert.throws(() => readConfig(environment({ ZEBRA_RPC_COOKIE_FILE: "" })), /requires a cookie file/);
  assert.throws(
    () => readConfig(environment({ ZEBRA_RPC_USER: "user", ZEBRA_RPC_PASSWORD: "pass" })),
    /either a cookie file or explicit credentials/,
  );
});

test("rejects long but known bearer placeholders", () => {
  assert.throws(
    () => readConfig(environment({ GATEWAY_BEARER_TOKEN: "replace-me-with-at-least-32-random-bytes" })),
    /must not be a placeholder/,
  );
  assert.throws(
    () => readConfig(environment({ GATEWAY_BEARER_TOKEN: "x".repeat(64) })),
    /must not be a placeholder/,
  );
});

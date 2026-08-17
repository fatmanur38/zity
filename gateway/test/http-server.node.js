import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { createGatewayServer } from "../src/http-server.js";

test("protects every v1 endpoint with bearer auth and a testnet header", async (t) => {
  const token = "x".repeat(32);
  const service = {
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
  };
  const server = createGatewayServer({ service, bearerToken: token });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/v1/health`;

  let response = await fetch(url);
  assert.equal(response.status, 401);

  response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 400);

  response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, "x-zity-network": "testnet" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), await service.health());
  assert.equal(response.headers.get("cache-control"), "no-store");
});

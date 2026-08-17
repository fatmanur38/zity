import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JsonRpcClient } from "../src/rpc-client.js";

test("reads a rotating Zebra cookie file for every RPC call", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "zity-zebra-cookie-"));
  const cookieFile = join(directory, ".cookie");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const authorizations = [];
  const fetchImpl = async (_url, init) => {
    authorizations.push(init.headers.authorization);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: "fixture", result: { chain: "test" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new JsonRpcClient({
    url: "https://zebra.internal/",
    cookieFile,
    fetchImpl,
  });

  await writeFile(cookieFile, "__cookie__:first-secret\n", { mode: 0o600 });
  await client.call("getblockchaininfo");
  await writeFile(cookieFile, "__cookie__:rotated-secret\n", { mode: 0o600 });
  await client.call("getblockchaininfo");

  assert.deepEqual(authorizations, [
    `Basic ${Buffer.from("__cookie__:first-secret").toString("base64")}`,
    `Basic ${Buffer.from("__cookie__:rotated-secret").toString("base64")}`,
  ]);
});

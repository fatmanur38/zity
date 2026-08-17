# ZITY Zcash testnet gateway

This directory is a standalone Node.js reference gateway for ZITY's real Zcash testnet payment path. It implements the exact upstream HTTP surface used by the Vercel proxy:

- `GET /v1/health`
- `POST /v1/payment-challenges`
- `GET /v1/payment-challenges/:challengeId`
- `POST /v1/payment-challenges/:challengeId/verify`
- `GET /v1/transactions/:txid`

It has no mock provider and no success fallback. An unavailable node, an unexpected network, RPC schema drift, a reused receiver or transaction, and an unproven receiver/amount match all fail closed.

## Current Zcash stack and the compatibility boundary

This gateway does **not** use `zcashd`. The official zcashd documentation says that zcashd reached end of life, does not support NU6.3, and 6.20.0 nodes stop at the end-of-support height on July 18, 2026. A new deployment must use the current Z3 stack: Zebra for chain state and Zallet for wallet state.

- [zcashd deprecation and end-of-life details](https://zcash.github.io/zcash/user/deprecation.html)
- [Zallet installation and Zebra/Zaino backends](https://zcash.github.io/zallet/guide/installation/index.html)
- [Zallet JSON-RPC reference](https://zcash.github.io/zallet/rpc/index.html)

Zallet is still documented as beta. Its `z_listtransactions` method is explicitly experimental. Its `z_listunspent` address filter is not safe for per-diversifier attribution: for a shielded address in a Unified Account, that filter may return notes for the whole account. This gateway therefore never uses `z_listunspent` to authorize a challenge.

The Zallet beta.1 release currently pinned by Z3 may omit `locked` from `getwalletstatus`. The adapter accepts that omission only when `node_tip.height`, `wallet_tip.height`, and `fully_synced_height` are identical, the wallet/node tip hashes match, and Zebra independently proves the same current tip height and hash. An explicit `locked: true`, a non-boolean value, or any tip drift fails readiness.

The selected current adapter is:

1. Probe both live services with `rpc.discover`; require the Zallet title and all methods this implementation depends on. Query `z_getaccount` and require the configured UUID to match an actual account before reporting readiness.
2. Ask Zallet for a new Sapling-only Unified Address with `z_getaddressforaccount`.
3. Decompose it with `z_listunifiedreceivers` and reject any transparent or Orchard receiver.
4. Scan the configured account and bounded height range with experimental `z_listtransactions`.
5. Require a non-change output whose `to_address` exactly equals either that fresh UA or its exact Sapling receiver, whose `to_account` is the configured account UUID, and whose integer zatoshi value is exact.
6. Cross-check the candidate with `z_viewtransaction`; require the same account, receiver, value, incoming direction, and non-internal output before accepting it.
7. Obtain confirmations and block hash from that wallet view. Zebra independently supplies `getblockchaininfo`, and every operational call requires `chain === "test"`.
8. Bind the two services cryptographically: fetch Zebra's block hash at Zallet's reported node-tip height and require an exact hash match. A second fresh Zallet status is allowed once for a concurrent tip/reorg race; another mismatch fails closed. This prevents a regtest Zallet from being paired with an unrelated public-testnet Zebra merely because address encodings look alike.

This is safer than an account-balance delta, but the precise `to_address` behavior must still be validated against the Zallet release you deploy. The default `ZITY_LIVE_RECEIVER_MATCH_VALIDATED=false` makes health report `indexerAvailable: false` and prevents challenge creation. There is no automatic compatibility fallback.

## Mandatory live validation

Pin the Zebra and Zallet versions. Before enabling the gateway, perform this test on Zcash testnet with the same Zallet database and account:

1. Confirm Zebra's `getblockchaininfo.chain` is exactly `test` and both Zebra and Zallet are fully synced.
2. Call `z_getaddressforaccount` with `[ACCOUNT_UUID, ["sapling"]]` and record the returned UA and current height.
3. Call `z_listunifiedreceivers` for that UA. It must return exactly one `sapling` receiver and no `p2pkh`, `p2sh`, or `orchard` receiver.
4. Send the configured exact testnet amount to the UA, without a memo.
5. Call `z_listtransactions` for that account from the recorded height. The received output must identify either the exact UA or the exact Sapling receiver, the configured account UUID, `is_change: false`, and the exact integer zatoshi value.
6. Call `z_viewtransaction` for its txid. An output must repeat the exact account/receiver/value proof with `outgoing: false` and `walletInternal: false`; confirmation count must advance when mined.
7. Run the gateway fixture tests, then set `ZITY_LIVE_RECEIVER_MATCH_VALIDATED=true` and redeploy. Repeat all steps after every Zallet upgrade because the method is experimental.

If any field is absent or behaves differently, leave the flag false and update/test the adapter against that pinned release. Do not weaken the match to an account-wide balance or note lookup.

## External Z3 testnet deployment

The official [Z3 operator guide](https://github.com/ZcashFoundation/z3/blob/main/README.md) is the shortest supported path to a current public-testnet Zebra + Zallet stack. For testnet, budget approximately 2 CPU cores minimum (4+ recommended), 8 GB or more RAM for the full stack, about 30 GB of SSD space with growth headroom, and a reliable network. Its current planning estimate for a first testnet sync is roughly 2–12 hours; hardware, peers, and chain growth can change this. Zebra's lower-level [system requirements](https://zebra.zfnd.org/user/requirements.html) should also be checked at deployment time.

Create Z3's live testnet configuration first:

```sh
git clone https://github.com/ZcashFoundation/z3.git
cd z3
./scripts/setup-network.sh testnet
```

The stock Z3/Zallet operator flow authenticates local wallet RPC commands with a cookie from the Zallet data directory. It does **not** provide the HTTP Basic credentials that this gateway's Zallet client requires, so the stock `config/testnet/zallet.toml` is not gateway-ready as-is. Do not solve that by sharing the Zallet data volume or RPC cookie with the gateway. Instead, create a dedicated password-authenticated RPC identity before starting the full stack.

Generate the password hash with Zallet's official [`add-rpc-user`](https://zcash.github.io/zallet/cli/add-rpc-user.html) command. Z3 pins the Zallet service to the `zallet-zaino` binary, so this Compose command invokes that exact binary without starting its dependencies:

```sh
docker compose --env-file .env.testnet run --rm --no-deps \
  --entrypoint /usr/local/bin/zallet-zaino \
  zallet add-rpc-user zity-gateway
```

Paste a strong password from a password manager at the hidden prompt. Copy the emitted stanza verbatim into the live, gitignored `config/testnet/zallet.toml`; its shape is:

```toml
[[rpc.auth]]
user = "zity-gateway"
pwhash = "<the command's generated pwhash>"
```

Keep that `pwhash` only in Zallet's config. Store the same **plaintext** password entered at the prompt in the gateway's secret environment, never in Zallet's TOML or source control:

```dotenv
ZALLET_RPC_URL=http://zallet:28232/
ZALLET_RPC_USER=zity-gateway
ZALLET_RPC_PASSWORD=<the same plaintext password>
```

The Zallet RPC link must remain on the private Compose/VPC network because Basic credentials protect the request but plain HTTP does not encrypt it. The gateway needs neither the Zallet wallet volume nor its cookie. If Zallet was already running when the stanza was added, recreate only that service so it rereads the live config:

```sh
docker compose --env-file .env.testnet up -d --force-recreate zallet
```

Then use Z3's two-phase boot sequence:

```sh
docker compose --env-file .env.testnet up -d zebra
./scripts/check-zebra-readiness.sh 18080
docker compose --env-file .env.testnet up -d
```

Start Zebra first and do not start the rest of the stack until the readiness poller succeeds; the official guide notes that starting Zallet earlier causes restart loops while Zebra is still syncing. Then:

1. Confirm Zallet's `getwalletstatus` is fully synced, create or select a dedicated account, back up its seed, and record its UUID. On releases that include `locked`, it must not be `true`; the pinned beta.1 omission is handled only under the exact-tip compatibility rule above.
2. Complete the live receiver validation in the previous section before setting `ZITY_LIVE_RECEIVER_MATCH_VALIDATED=true`.
3. Deploy this gateway as a separate service on a private network that can reach the Zallet wallet RPC and Zebra RPC. Mount Zebra's cookie directory read-only as described below.
4. Expose only the gateway through an HTTPS ingress. Keep wallet/node RPC ports private; testnet P2P port `18233` may be published as required by the node operator.
5. Configure the Vercel proxy with this HTTPS URL and the same bearer token, amount, TTL, confirmation count, and unlock policy. A ready gateway health document must report `connected`, `synced`, `walletAvailable`, and `indexerAvailable` as true.

Zaino is optional for this gateway. Zallet's official [backend selection guide](https://zcash.github.io/zallet/guide/installation/index.html#choosing-a-chain-backend) recommends the `zaino` backend when Zebra and Zallet are separate containers using JSON-RPC, including stock Zebra images and Z3-style deployments. The gateway still talks only to Zallet's wallet RPC and Zebra's chain RPC; it does not trust or query Zaino directly. Whichever Zallet backend is selected, the same tip-height/hash provenance check remains mandatory.

## Configuration

Copy `.env.example` to a secret environment store; do not commit a populated file. Important settings are:

| Gateway setting | Purpose |
| --- | --- |
| `GATEWAY_BEARER_TOKEN` | At least 32 bytes; configure the same secret as the Vercel proxy's `ZITY_TESTNET_GATEWAY_TOKEN`. |
| `ZITY_GATEWAY_NETWORK` | Must be the literal `testnet`; any other value prevents startup. |
| `ZITY_PAYMENT_AMOUNT` | Canonical decimal ZEC amount, up to eight decimals. Must match `ZITY_TESTNET_PAYMENT_AMOUNT` in the proxy. |
| `ZITY_MIN_CONFIRMATIONS` | Required confirmation count. Must match the proxy. |
| `ZITY_CHALLENGE_TTL_SECONDS` | Challenge lifetime. Must match the proxy. |
| `ZITY_UNLOCK_POLICY` | `confirmed` or `detected`. Must match the proxy. |
| `ZALLET_ACCOUNT_UUID` | UUID of the dedicated Zallet testnet account. |
| `ZALLET_RPC_*` | Private Zallet endpoint and Basic credentials. These are never returned to the browser or proxy. |
| `ZEBRA_RPC_*` | Private Zebra endpoint plus either its rotating cookie file or an explicit Basic user/password pair. |
| `RPC_ALLOW_INSECURE_HTTP` | Explicit opt-in for HTTP on a private network. Public RPC links should use HTTPS. |
| `ZITY_LIVE_RECEIVER_MATCH_VALIDATED` | Operator acknowledgement for the pinned Zallet live test above. Defaults to false. |

Every `/v1` request also requires `Authorization: Bearer ...` and `x-zity-network: testnet`. Expose the gateway through TLS; keep both RPC endpoints on a private network.

## Run and test

Node 20 or newer is sufficient; there are no runtime dependencies.

```sh
cd gateway
npm test
set -a
. ./.env
set +a
npm start
```

Health request:

```sh
curl --fail-with-body \
  -H "Authorization: Bearer $GATEWAY_BEARER_TOKEN" \
  -H "x-zity-network: testnet" \
  http://127.0.0.1:8787/v1/health
```

The health endpoint returns the shared `TestnetHealth` shape. A wrong chain or unavailable RPC returns a 200 health document with false readiness fields, while payment operations return no entitlement-producing result.

## Docker

```sh
docker build -t zity-zcash-testnet-gateway ./gateway
```

For a stock Z3 testnet deployment, attach the gateway to Z3's published external network and cookie volume. This is Zebra's chain-RPC cookie only: never mount the Zallet wallet data volume or Zallet RPC cookie into the gateway. The mount destination below matches `ZEBRA_RPC_COOKIE_FILE=/run/zebra-cookie/.cookie`, while the network makes the stock `zebra` and `zallet` DNS names in `.env.example` resolvable:

```sh
docker run --rm \
  --env-file ./gateway/.env \
  --network z3-testnet \
  --mount type=volume,src=z3-testnet-cookie,dst=/run/zebra-cookie,readonly \
  -p 8787:8787 \
  zity-zcash-testnet-gateway
```

Run this only after the Z3 testnet stack is up. Zebra writes `.cookie` as uid 10001 with mode `0600`, but Z3's `cookie-permissions` sidecar continuously changes it to `0644` inside the shared volume. The gateway image can therefore remain on its unprivileged `node` user; no UID override or host bind mount is needed. If the sidecar is absent or the cookie is unreadable, gateway readiness fails closed. These stable network, volume, DNS, and cookie-path identifiers come from Z3's [consumer attachment contract](https://github.com/ZcashFoundation/z3/blob/main/docs/integrations/compose-peer.md).

The gateway client rereads the rotating cookie for every Zebra RPC call. Do not copy it into the image or a browser-visible environment variable. If a platform cannot attach the Z3 network and cookie volume, put an authenticated private RPC boundary in front of Zebra and set `ZEBRA_RPC_USER` plus `ZEBRA_RPC_PASSWORD` for that boundary instead; the gateway requires one authentication mode and refuses both at once.

The image runs as the unprivileged `node` user. Put the gateway behind an HTTPS ingress and restrict egress to the intended Zebra and Zallet endpoints.

## Payment and privacy behavior

- Challenge creation is serialized, and each challenge must receive a newly derived Sapling-only testnet UA.
- Challenge IDs are UUIDs, matching the shared BFF contract.
- The requested amount, confirmation count, TTL, and unlock policy must exactly equal server configuration; the gateway never silently changes them.
- The ZIP-321 URI is exactly `zcash:<receiver>?amount=<decimal>`. It contains no memo, message, label, session ID, or other identifying field.
- The opaque session ID is validated and then discarded; it is neither retained in the challenge ledger nor included in the payment request.
- Amount matching uses integer zatoshis. A receiver-specific wrong amount becomes `invalid-payment`; it never unlocks access.
- `detected` means a matching transaction is visible with zero confirmations. `confirming` means it has some but fewer than the configured count. `verified` means it meets the configured count.
- For `detected` policy, `unlockEligible` may be true before `verified`; the `verified` boolean remains true only in the `verified` state, matching the Vercel proxy contract.
- A txid is claimed by at most one challenge in this process.

## Deliberate reference limitations

The challenge ledger is an in-memory `Map`. It is suitable for a single-process reference deployment and live integration testing only:

- Restarting the process loses challenges, receiver ownership, first-seen timestamps, and txid claims.
- Multiple replicas do not share state and must not be used behind a load balancer.
- The bounded transaction scan can fail closed under unusually high account activity.
- This service does not issue or persist the application's metro entitlement. After a validated same-origin verification response, the client-side pure payment state machine creates the current local, unsigned entitlement; it is not a server-authoritative credential.

Before production, replace the in-memory ledger with a durable transactional store. Enforce unique constraints on challenge ID, receiver, and txid; preserve first detection and confirmation history; make challenge creation idempotent; and test reorg/restart recovery. Do not scale this reference horizontally as-is.

# Zcash Integration

What ZITY actually uses from Zcash, where it lives in the code, and — just as
importantly — what it does not use.

Every claim below points at a file and line you can read.

## The boundary, stated plainly

ZITY is a privacy **education** product with a **real** Zcash payment layer.
Those are two different things and the codebase keeps them apart:

| | Real Zcash | Simulation |
| --- | --- | --- |
| Paying the metro fare | ✅ On-chain testnet transaction | |
| Payment request format | ✅ ZIP-321 | |
| Confirmation / reorg handling | ✅ Against the real chain | |
| Shielded address derivation | ✅ In `gateway` mode | |
| Exposure score, correlation graph | | ✅ Deterministic model |
| "Minimum disclosure" game mechanic | | ✅ Inspired by, not implemented with, ZK |

We do not claim the game mechanic is cryptography. The chain integration is
where Zcash is genuinely load-bearing.

---

## 1. ZIP-321 payment requests

Payment requests follow [ZIP-321](https://zips.z.cash/zip-0321), so any Zcash
wallet can pay one — there is no ZITY-specific wallet integration.

Construction, explorer provider —
[`api/_lib/PublicExplorerProvider.ts:178`](../api/_lib/PublicExplorerProvider.ts#L178):

```ts
paymentUri: `zcash:${this.config.receiverAddress}?amount=${amount}`,
```

Construction, gateway provider —
[`gateway/src/zip321.js:1`](../gateway/src/zip321.js#L1). There is also a
parser on the inbound side ([`ZcashTestnetGateway.ts:50`](../api/_lib/ZcashTestnetGateway.ts#L50))
so a URI produced elsewhere can be validated rather than trusted.

**No memo, label or message.** ZIP-321 permits them; ZITY omits them
deliberately. None is needed for this flow, and a memo is an avoidable
metadata channel in a product about minimising metadata.

## 2. Zatoshi-exact amount arithmetic

Amounts are compared as `BigInt` zatoshi, never floats, so no rounding error
can cause a payment to be missed or wrongly accepted.

[`gateway/src/config.js:44`](../gateway/src/config.js#L44):

```js
const zatoshis = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
```

The range is bounded at 21,000,000 ZEC. Partial and excess payments are both
rejected — matching is exact.

## 3. Per-challenge amount derivation (attribution without a wallet)

This is the piece that makes node-free operation possible.

A public explorer can tell you what arrived at an address, but not *which
request* it was for. Rather than run a wallet to derive a fresh address per
challenge, ZITY derives a unique **amount** per challenge from an HMAC of the
challenge id — [`PublicExplorerProvider.ts:99`](../api/_lib/PublicExplorerProvider.ts#L99):

```ts
const digest = createHmac("sha256", config.challengeSecret).update(challengeId).digest("hex");
const slot = BigInt(`0x${digest.slice(0, 16)}`) % AMOUNT_SLOTS;   // 10,000 slots
return zecToZatoshis(config.paymentAmount) + slot;
```

The base price plus one of 10,000 zatoshi-level slots. The payer's wallet
sees an ordinary ZIP-321 request; the server can attribute the payment
uniquely without storing session state.

The challenge id is a **UUIDv7** ([line 67](../api/_lib/PublicExplorerProvider.ts#L67)) —
its creation time lives in the leading 48 bits, so expiry is checkable from
the id alone. No database.

`ZITY_TESTNET_CHALLENGE_SECRET` is what makes the amount unforgeable, which
is why it must never carry a `VITE_` prefix.

**Known limitation:** with 10,000 slots, distinct concurrent challenges can
collide. Fine for a demo, not for money. Production would use a fresh
address per challenge — which is exactly what `gateway` mode does.

## 4. Confirmation depth and reorg rejection

Confirmations are computed against the real tip —
[`PublicExplorerProvider.ts:224`](../api/_lib/PublicExplorerProvider.ts#L224):

```ts
const tip = Math.max(chainHeight, match.blockHeight);
const confirmations = tip - match.blockHeight + 1;
```

The `Math.max` clamp is not cosmetic. The address scan is the slow call, so
the tip is read *after* it; without the clamp a block landing mid-request
could report a mined transaction as having zero confirmations.

Verification is two-stage: a candidate first matches on aggregate value, then
is re-proved against the transaction's own outputs for receiver **and** exact
zatoshi value ([`provesExactOutput`, line 326](../api/_lib/PublicExplorerProvider.ts#L326)).
Non-canonical blocks are rejected outright ([line 328](../api/_lib/PublicExplorerProvider.ts#L328)):

```ts
if (payload.isCanonical === false) return false;
```

Access is gated on `unlockEligible`, which respects the configured
`unlockPolicy` (`confirmed` by default).

## 5. Testnet enforcement, in three independent layers

Mainnet funds must never be reachable, so the check is not made once:

1. **Config** — `ZITY_ZCASH_NETWORK` must be exactly `testnet`, else
   `NETWORK_MISMATCH` at startup ([`api/_lib/config.ts:74`](../api/_lib/config.ts#L74)).
2. **Chain** — Zebra's `getblockchaininfo` must report `chain === "test"`,
   re-checked per operation ([`gateway/src/zallet-adapter.js:126`](../gateway/src/zallet-adapter.js#L126)).
3. **Address** — recipients must carry a testnet prefix
   (`utest1`, `ztestsapling1`, `tutest1`, `textest1`, `tm`, `t2`);
   anything else raises `MAINNET_DESTINATION_REJECTED`
   ([`gateway/src/zip321.js:8`](../gateway/src/zip321.js#L8)).

## 6. Sapling shielded address derivation — `gateway` mode

The deepest Zcash usage. For each challenge, a fresh Unified Address is
derived from the **Sapling pool only**, then decomposed and checked to prove
it is not accidentally carrying a transparent or Orchard receiver —
[`gateway/src/zallet-adapter.js:350`](../gateway/src/zallet-adapter.js#L350):

```js
derived = await this.zalletRpc.call("z_getaddressforaccount", [
  this.config.accountUuid,
  ["sapling"],
]);
// …must return receiver_types === ["sapling"] and a utest1… address

receivers = await this.zalletRpc.call("z_listunifiedreceivers", [derived.address]);
// …must expose a ztestsapling1… receiver and NO p2pkh, p2sh or orchard
```

A UA that fails either check is rejected (`FRESH_RECEIVER_INVALID`,
`RECEIVER_DECOMPOSITION_INVALID`) rather than used.

### RPC surface

| RPC | Used for |
| --- | --- |
| `getblockchaininfo` | Chain identity, height, sync state |
| `getblockhash` | Block identity / canonicality |
| `getwalletstatus` | Wallet sync state |
| `z_getaccount` | Account validation |
| `z_getaddressforaccount` | Fresh Sapling-only UA per challenge |
| `z_listunifiedreceivers` | Proving the UA is exclusively shielded |
| `z_listtransactions` | Finding the incoming payment |
| `z_viewtransaction` | Confirming amount and receiver |

---

## The two providers

| | `explorer` | `gateway` |
| --- | --- | --- |
| Infrastructure | None | Zebra + Zallet, ~30 GB, hours to sync |
| Receiver | Transparent (`tm…`/`t2…`) | Sapling shielded (`utest1…`) |
| Attribution | HMAC-derived unique amount | Fresh address per challenge |
| Payment privacy | Visible on chain | Shielded |
| Setup | ~15 minutes | Substantial |

Both verify against the real chain. **Neither has a mock fallback** — if the
chain is unreachable, the API errors rather than pretending to succeed.

### Honest limitation of the live deployment

The public deployment runs `explorer` mode, which means the payment rail uses
a **transparent** address and is publicly visible.

This is a property of public explorers, not a shortcut: they cannot read
shielded outputs. The config therefore rejects a shielded receiver at startup
with an explicit message rather than failing mysteriously later —
[`api/_lib/config.ts:67`](../api/_lib/config.ts#L67):

```ts
const TESTNET_TRANSPARENT_ADDRESS = /^(?:tm[1-9A-HJ-NP-Za-km-z]{33}|t2[1-9A-HJ-NP-Za-km-z]{33})$/;
```

The shielded path is fully implemented and validated; it requires running
your own node. See [Testnet Setup](TESTNET_SETUP.md) Option B.

---

## What ZITY does not use

Stated explicitly so nobody has to guess, and so no reviewer is misled:

- **No zero-knowledge proof generation of our own.** ZITY does not create
  Groth16/Halo2 proofs. It relies on Zcash's own protocol for that.
- **No Orchard.** The gateway derives Sapling-only addresses, and explicitly
  rejects an Orchard receiver.
- **No nullifier handling.** Not touched at any layer.
- **No memo field.** Deliberately omitted, as above.
- **No viewing-key sharing or selective disclosure primitives.**

The in-game "minimum disclosure" mechanic is a **deterministic simulation
inspired by** these ideas — it teaches why they matter. It is not built on
them. The root [README](../README.md) makes the same statement.

## Verifying the claims yourself

```bash
# Is a deployment really on-chain?
curl -s https://z-city.vercel.app/api/testnet/health

# providerMode: "real" + a live blockHeight = real chain.
# providerMode: "mock" = demo mode, nothing on-chain.
```

Then read the verification path end to end — it is about 350 lines:
[`api/_lib/PublicExplorerProvider.ts`](../api/_lib/PublicExplorerProvider.ts),
with tests in
[`api/_lib/PublicExplorerProvider.test.ts`](../api/_lib/PublicExplorerProvider.test.ts).

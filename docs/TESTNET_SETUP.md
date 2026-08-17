# Real Zcash Testnet Setup

ZITY's redesigned Metro checkpoint can require a genuine Zcash testnet
payment before it unlocks. This is a step-by-step guide to standing that up,
covering both supported providers.

Neither provider has a mock fallback: if the chain can't be verified, the
checkpoint stays locked. There is no code path that silently pretends a
payment succeeded.

## Choose a provider

| | `explorer` | `gateway` |
|---|---|---|
| Setup time | ~15 minutes | Hours (full chain sync) |
| Infrastructure | None — serverless only | A VPS running Zebra + Zallet |
| Receiver address | Transparent (`tm…` / `t2…`) | Shielded (`utest1…`) |
| Best for | Demos, reviews, hackathons | Production-shaped deployments |

Set `ZITY_TESTNET_PROVIDER` to pick one. Both implement the same
`ZcashTestnetGateway` contract, so nothing else in the app changes.

---

## Option A — `explorer` (no node required)

This path verifies payments against a public Zcash testnet block explorer.
No wallet software, no Docker, no chain sync.

### A1. Generate a receiving address

```sh
npm run testnet:address
```

This prints a fresh testnet transparent address and its private key, using
only Node's built-in `crypto` module — no dependencies, no wallet needed.

```
Address (public — put this in .env):
  tmYFv3oV6gyTTR2FjziAxQV99vZav7KUnko

Private key, WIF (SECRET — store offline, never commit):
  cQnrx...
```

The address is safe to put in configuration. ZITY never needs the private
key — verification only reads the public chain, it never spends. Keep the
key only if you intend to move the received test funds elsewhere later.

> A public explorer cannot see shielded output values or recipients, so the
> receiver **must** be transparent. `explorerServerConfig()` rejects a
> shielded address at startup rather than accepting one that could never
> match.
>
> Use a **fresh** address. A busy address is slow to query: an address with
> no history answers in well under a second, while one with hundreds of
> thousands of transactions can take 10+ seconds and risk timing out.

### A2. Fund a paying wallet

You'll also need a wallet that can *send* testnet ZEC — separate from the
receiving address above. Options:

- **Zingo CLI** (`zingolib`) — `zingo-cli --chain testnet`, actively
  maintained.
- Any wallet that supports a custom lightwalletd server.

Public testnet lightwalletd servers change over time; confirm whichever one
you use is reachable before relying on it (`testnet.zec.rocks:443` was
verified working during this project's setup).

Request testnet ZEC (TAZ) from a faucet:

- https://zcashfaucet.jinolabs.xyz/ (0.1 TAZ per request, 24h cooldown per address)
- https://fauzec.com/

### A3. Configure environment variables

```sh
openssl rand -hex 32   # generates the challenge secret
```

```dotenv
ZITY_NETWORK_MODE=testnet
ZITY_ZCASH_NETWORK=testnet
ZITY_TESTNET_PROVIDER=explorer

ZITY_TESTNET_RECEIVER_ADDRESS=tm...        # from A1
ZITY_TESTNET_CHALLENGE_SECRET=...          # from the openssl command above

ZITY_TESTNET_EXPLORER_URL=https://api.testnet.cipherscan.app
ZITY_TESTNET_PAYMENT_AMOUNT=0.001
ZITY_TESTNET_MIN_CONFIRMATIONS=1
```

### A4. Run and verify

```sh
npm install
npm run dev
```

`npm run dev` serves `/api/testnet/*` itself — no Vercel CLI needed. It runs
the exact same handlers as production.

```sh
curl http://localhost:5173/api/testnet/health
```

Expect a real, live block height:

```json
{"providerMode":"real","connected":true,"synced":true,"blockHeight":4279488, ...}
```

### How attribution works without a wallet

Without a wallet, the server can't derive a fresh receiving address per
payment request the way a real wallet would. Instead, each challenge is
identified by one static receiver plus a **unique payment amount**, derived
via HMAC from a server-held secret and the challenge id. The amount is
therefore unpredictable to a client but exactly recomputable by the server.

The challenge id itself is a UUIDv7, which carries its own creation
timestamp — that's what makes challenge expiry and confirmation lookups
possible without a database.

Verification is two-stage: a payment candidate is found by exact amount in
the receiver's transaction history, then re-proven against that
transaction's own outputs (receiver + exact zatoshi value), rejecting
non-canonical (reorged) blocks.

---

## Option B — `gateway` (self-hosted Zebra + Zallet)

This path runs a real Zebra (chain) + Zallet (wallet) stack and verifies
payments against your own node. It supports shielded receivers and does not
depend on a third-party explorer's uptime or rate limit, at the cost of
running infrastructure.

Full setup, including the current Z3 operator stack, mandatory live receiver
validation, and Docker deployment, is documented in
[`gateway/README.md`](../gateway/README.md).

Budget roughly 2 CPU cores, 8 GB RAM, 30 GB SSD, and 2–12 hours for the
first testnet sync. Do not use `zcashd` — it does not support NU6.3 and
reached end-of-support in July 2026; use the current Z3 stack (Zebra +
Zallet) instead.

---

## In-game payment flow

1. Play through to the Metro checkpoint.
2. The UI shows a [ZIP-321](https://zips.z.cash/zip-0321) QR code:
   `zcash:tm...?amount=0.00104109`.
3. Pay the **exact** amount shown. In `explorer` mode, that exact amount is
   the challenge's identity — rounding breaks the match.
4. Status advances automatically: `WAITING → CONFIRMING → VERIFIED →
   entitlement issued`.
5. `PROVE ACCESS` consumes the one-use entitlement; a second attempt is
   rejected.

Testnet block time is roughly 2.5 minutes, so confirmation typically takes a
few minutes.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `RECEIVER_NOT_CONFIGURED` | No receiver address set | Run `npm run testnet:address`, set it in `.env` |
| `RECEIVER_NOT_TRANSPARENT_TESTNET` | Shielded address given to `explorer` mode | Use a `tm…`/`t2…` address, or switch to `gateway` mode |
| `CHALLENGE_SECRET_REQUIRED` | Missing or short secret | `openssl rand -hex 32` |
| `EXPLORER_TIMEOUT` | Receiver address has heavy transaction history | Use a fresh address |
| `providerMode: "mock"` in health response | `ZITY_NETWORK_MODE` isn't `testnet` | Fix the env var, redeploy |
| Payment stuck in `WAITING` | Amount paid doesn't match exactly | Pay the exact amount on the QR code |

## Known limitations

- **`explorer` mode uses a transparent receiver**, not shielded — the
  payment rail itself is publicly visible in that mode. ZITY's privacy
  lesson lives in its minimum-disclosure game mechanic, not the settlement
  rail; use `gateway` mode if a shielded rail matters for your use case.
- **Txid reuse isn't server-enforced** in `explorer` mode, since it's
  stateless by design. The unique-amount scheme makes collisions
  impractical, but a production deployment would want a durable ledger.
- **Both modes depend on external infrastructure being reachable.** If it
  isn't, the flow fails closed rather than falling back to a mock.
- **The browser-side entitlement is unsigned and local.** It gates game
  progression, not a production authorization boundary.

# API Reference

Four endpoints under `/api/testnet`, used only when real testnet mode is
enabled. They are Vercel serverless functions, file-system routed from
`api/testnet/`, and they run identically under `npm run dev`.

Every request and response is validated against a Zod schema in
`src/testnet/contracts.ts`, shared by client and server — the contract below
is generated from the same source the code enforces.

All responses send `cache-control: no-store` and
`x-content-type-options: nosniff`.

## Conventions

**Amounts** are decimal ZEC strings with at most 8 fractional digits
(`"0.001"`), never floats. Server-side comparisons are exact `BigInt`
zatoshi arithmetic.

**Timestamps** are ISO 8601 with an explicit offset.

**`challengeId`** is a UUID. ZITY issues UUIDv7, so the creation time is
recoverable from the value itself and no server-side session store is needed.

**Errors** always use one envelope:

```json
{
  "error": {
    "code": "TESTNET_DISABLED",
    "message": "Real testnet mode is not enabled on this deployment.",
    "retryable": false,
    "details": "optional"
  }
}
```

`retryable` tells the client whether backing off and trying again could
plausibly succeed. Honour it rather than retrying blindly.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Body or path parameter failed schema validation |
| 400 | `INVALID_JSON` | Body was not valid JSON |
| 400 | `INVALID_PATH_PARAMETER` | Required path segment missing |
| 405 | `METHOD_NOT_ALLOWED` | Wrong HTTP method for this route |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeded 16 KB |
| 500 | `INTERNAL_ERROR` | Unhandled failure |
| 503 | `TESTNET_DISABLED` | `ZITY_NETWORK_MODE` is not `testnet` |
| 503 | `NETWORK_MISMATCH` | Configured network is not testnet |
| 503 | `TESTNET_NOT_CONFIGURED` | Provider settings missing |

---

## `GET /api/testnet/health`

Whether the deployment is really talking to the chain. Safe to call always —
this is the only endpoint that responds even when testnet mode is off.

```bash
curl -s https://your-deployment/api/testnet/health
```

```json
{
  "network": "testnet",
  "providerMode": "real",
  "connected": true,
  "synced": true,
  "blockHeight": 4280377,
  "walletAvailable": true,
  "indexerAvailable": true,
  "checkedAt": "2026-08-17T17:10:50.653Z",
  "message": "Verifying against the public Zcash testnet explorer."
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `providerMode` | `"mock" \| "real"` | `"mock"` means testnet mode is disabled — nothing here touches the chain |
| `connected` | boolean | Provider reachable |
| `synced` | boolean | Backing chain considered synced |
| `blockHeight` | integer \| null | Current tip; `null` when disabled |

**`providerMode: "real"` with a non-null `blockHeight` is the single check
that a deployment is genuinely on-chain.**

---

## `POST /api/testnet/payment-challenge`

Create a payment request. Returns `201`.

```json
{ "sessionId": "a-client-generated-id-16-96-chars", "purpose": "metro-access" }
```

| Field | Rule |
| --- | --- |
| `sessionId` | `^[A-Za-z0-9_-]{16,96}$` |
| `purpose` | Must be `"metro-access"` |

The body is `strict` — unknown properties are rejected, not ignored.

**Response**

```json
{
  "challengeId": "0191f3c2-7a10-7c3e-9f21-4b8d5e6a7c90",
  "network": "zcash-testnet",
  "providerMode": "real",
  "amount": "0.00104217",
  "recipient": "tmEXAMPLEtestnetTransparentAddress",
  "paymentUri": "zcash:tmEXAMPLE…?amount=0.00104217",
  "expiresAt": "2026-08-17T17:20:50.653Z",
  "createdAt": "2026-08-17T17:10:50.653Z"
}
```

`paymentUri` is a [ZIP-321](https://zips.z.cash/zip-0321) payment request. Any
Zcash wallet can consume it; the client renders it as a QR code. It carries
no memo, label or message — none is required, and a memo would be an
avoidable metadata channel.

`amount` is **not** the flat configured price. Each challenge derives a
unique amount from an HMAC of its id, which is what lets the explorer
provider attribute an incoming payment to a specific challenge without a
wallet or a server-side session. See [Zcash Integration](ZCASH_INTEGRATION.md).

---

## `GET /api/testnet/payment-challenge/{challengeId}`

Poll the status of a challenge.

```json
{
  "challengeId": "0191f3c2-7a10-7c3e-9f21-4b8d5e6a7c90",
  "network": "zcash-testnet",
  "providerMode": "real",
  "state": "confirming",
  "amount": "0.00104217",
  "recipient": "tmEXAMPLE…",
  "expiresAt": "2026-08-17T17:20:50.653Z",
  "confirmations": 1,
  "requiredConfirmations": 1,
  "unlockPolicy": "confirmed",
  "unlockEligible": false,
  "transaction": {
    "network": "zcash-testnet",
    "txid": "a1b2…64hex",
    "confirmations": 1,
    "blockHeight": 4280377,
    "blockHash": "0000…64hex",
    "detectedAt": "2026-08-17T17:12:03.115Z",
    "confirmedAt": null
  },
  "errorCode": null,
  "errorMessage": null
}
```

### States

| State | Meaning |
| --- | --- |
| `not-created` | No challenge yet (client-side initial state) |
| `creating` | Request in flight (client-side) |
| `payment-request-created` | Challenge issued, URI ready |
| `waiting` | Nothing seen on chain yet |
| `detected` | Matching transaction seen, not yet confirmed |
| `confirming` | Mined, below the required confirmation depth |
| `verified` | Confirmed to the configured depth |
| `expired` | TTL elapsed without a matching payment |
| `failed` | Provider reported failure |
| `network-error` | Chain or provider unreachable |
| `invalid-payment` | Something arrived, but it did not match exactly |

`unlockEligible` — not `state` — decides whether the game grants access. It
follows `unlockPolicy`: under `confirmed` it requires `verified`; under
`detected` it unlocks earlier, and the UI keeps labelling the transaction as
confirmation-pending.

**Poll politely.** Testnet blocks average ~2.5 minutes; polling every few
seconds gains nothing and strains public explorers.

---

## `POST /api/testnet/payment-challenge/{challengeId}/verify`

Force a verification pass rather than waiting for the next poll. No body.

```json
{
  "challengeId": "0191f3c2-7a10-7c3e-9f21-4b8d5e6a7c90",
  "network": "zcash-testnet",
  "providerMode": "real",
  "state": "verified",
  "verified": true,
  "unlockEligible": true,
  "unlockPolicy": "confirmed",
  "transaction": { "…": "as above" }
}
```

Verification is two-stage and deliberately strict. A candidate must match the
expected zatoshi amount exactly, and is then re-proved against the
transaction's own outputs for both receiver and value. Transactions on a
non-canonical (reorged) block are rejected.

---

## `GET /api/testnet/transaction/{txid}`

Look up one transaction. `txid` must match `^[a-fA-F0-9]{64}$`.

```json
{
  "network": "zcash-testnet",
  "txid": "a1b2…64hex",
  "confirmations": 6,
  "blockHeight": 4280377,
  "blockHash": "0000…64hex",
  "detectedAt": "2026-08-17T17:12:03.115Z",
  "confirmedAt": "2026-08-17T17:14:41.002Z"
}
```

---

## Typical flow

```
POST /payment-challenge                      → challengeId + paymentUri
   ↓  show QR, user pays from their wallet
GET  /payment-challenge/{id}   (poll)        → waiting → detected → confirming
   ↓
POST /payment-challenge/{id}/verify          → verified, unlockEligible: true
   ↓
client issues a single-use entitlement
```

The entitlement is `maxUses: 1` by design. Reuse is refused later in the
game on purpose — it is the lesson, not a bug.

## Using the API from TypeScript

Import the schemas rather than redeclaring the shapes:

```ts
import {
  paymentChallengeSchema,
  paymentChallengeStatusSchema,
  testnetHealthSchema,
} from "./src/testnet/contracts";

const health = testnetHealthSchema.parse(
  await (await fetch("/api/testnet/health")).json(),
);
```

Parsing on receipt means a server contract change surfaces as a validation
error at the boundary instead of an undefined field deep in the UI.

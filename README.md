# ZITY

ZITY is a playable privacy-by-design simulator. Players complete an ordinary
city route while WATCHER shows how persistent identifiers can connect Metro,
Cafe, Clinic, and Club activity into one profile. They can then redesign the
same interactions and compare what the city can learn in each version.

The core question is simple: **what does this service actually need to know?**

## Problem

Digital services often ask “who are you?” even when the actual requirement is
smaller: a valid ticket, an appointment, or an age threshold. Reusing a stable
account lets separate services correlate activity that was not intended to form
one cross-service profile.

## Product

ZITY turns that design problem into a compact 4–6 minute pixel-city experience.
The React interface explains objectives and WATCHER state while Phaser owns the
world, movement, interactions, click/tap auto-walk, and destination markers.

Audience mode requires no signup, account, wallet, or testnet funds. Presenter
mode deliberately uses a real, externally operated Zcash testnet wallet stack;
it never relabels a simulated response as a network result.

## Why This Matters

Data minimization is easier to understand when its consequences are visible.
ZITY contrasts a persistent account with scoped requirement proofs, without
framing privacy as invisibility or making cryptocurrency the story.

## Core Experience Loop

ZITY is structured around **EXPERIENCE / LIVE → ANALYZE → RETHINK → COMPARE**.

### 1. Experience / Live

1. Arrive in Central District and buy a Metro ticket.
2. Use the standard Metro flow, which connects a persistent city account.
3. Reuse that account at the Cafe and Clinic.
4. See WATCHER build links gradually without interrupting every action with a
   lesson.

### 2. Analyze

After the Clinic, the city shifts into an analytical perspective. WATCHER
expands the graph and shows that the central problem is not any single service:
the same identifier connected otherwise separate activities and enabled new
inferences.

### 3. Rethink

The player revisits Clinic, Metro, and Club interactions. Each offers three
functionally valid designs rather than one predetermined correct button:

- **Standard:** the requirement is satisfied using a persistent account plus
  additional fields.
- **Hybrid:** a scoped proof is used, but a persistent account is still shared.
- **Minimum:** only the predicates the service needs are revealed.

The Metro authorization is also tried twice. Its second use is rejected without
requiring identity exposure, demonstrating that privacy does not remove system
controls.

In real-network mode, the redesigned Metro inserts a settlement checkpoint
before issuing that authorization. A fresh testnet receiver and ZIP-321 payment
request are created, the transaction is detected and (under the default policy)
confirmed, and only a verified API response can issue the one-use entitlement.

### 4. Compare

Each redesigned interaction is compared with its standard counterpart. The
final screen explains:

- what each service actually needed;
- what each design disclosed;
- which services became linkable;
- which cautious inferences became possible or disappeared;
- which graph edges and persistent identifiers were removed.

The exposure percentage remains visible as a supporting metric, not the final
message.

The opening Spawn → Metro → WATCHER slice remains independently playable and
uses the same scenario and privacy systems as the full route.

## Desktop Controls

- `WASD` or arrow keys: move
- `E`: interact with a nearby active service
- click an active service: auto-walk and interact
- click the world: auto-walk
- `Esc`: pause/settings

## Mobile Controls

- Drag the bottom-left virtual joystick for direct movement.
- Tap an active service to auto-walk and interact.
- Tap the WATCHER bar to open the correlation graph as a bottom sheet.

Portrait is supported and does not require rotation. The camera follows the
player through the fixed logical 960×540 world rather than distorting it.

## English / Turkish Support

All experience text is stored in `src/i18n/en.ts` and `src/i18n/tr.ts`. Language
switching is instant and saved to `localStorage`. On first visit, `tr-*` browser
locales select Turkish; all others select English.

## Privacy Model

The deterministic privacy engine distinguishes:

- persistent fields such as account, email, phone, wallet, and device IDs;
- sensitive contextual fields such as a medical relationship;
- low-disclosure predicates such as “valid pass” or “age 18+.”

Scenario outcomes are recorded as two comparable tracks: a standard baseline
and the player's redesigned route. Disclosures, account-to-service edges,
cross-service links, inferences, and metrics are derived from those runs rather
than stored as unrelated counters.

Every option still authorizes the requested service. What changes is the data
made available for correlation. The current full standard benchmark has an
exposure score of about 90, while the minimum redesign route is about 20. Those
numbers summarize explainable scenario impacts; the result screen also presents
the concrete fields, links, and inferences behind the difference.

## Watcher Model

WATCHER is the experience's correlation and analysis layer. It shows only
cautious inferences supported by the simulated disclosures. For example, it
reports “possible health-related activity” when a persistent Clinic identifier
becomes linked to other services, not a diagnosis or medical fact. During
redesign, WATCHER also makes removed links and inferences visible.

## Architecture

```text
ZITY
 ├── React UI / Router / i18n / testnet checkpoint
 ├── Phaser pixel world + interaction abstraction
 ├── Scenario registry + deterministic privacy engine
 ├── Typed payment machine + one-use entitlement
 └── same-origin Vercel API
      └── ZcashTestnetGateway interface
           └── authenticated external gateway
                ├── wallet / receiver derivation
                ├── transaction discovery / indexer
                └── testnet node
```

The browser never talks to a wallet or node directly. Vercel validates every
gateway response as real testnet data before returning it to the game. The
reference external gateway stores active challenges in memory, so a single
long-running instance is required for a presentation; a production deployment
should replace that map with durable, encrypted state.

## Demo vs Real Network

| | Audience demo | Real testnet |
|---|---|---|
| Route | `/demo` | `/present` or `/demo?network=testnet` |
| Provider label | `DEMO` | `ZCASH TESTNET` only after a real health response |
| Wallet/funds | Not required | External compatible wallet and testnet ZEC required |
| Metro entitlement | Deterministic local entitlement | Issued only after gateway verification |
| Failure behavior | Playable offline simulation | Fails closed; no mock fallback |

The browser route selects the experience mode. The server's
`ZITY_NETWORK_MODE` is the authority for whether real endpoints are enabled. A
query string can never turn a demo-configured server into a real provider.

## Real Zcash Testnet Integration

Zcash is infrastructure for the redesigned Metro checkpoint, not the story of
the first half of the game. The real path is:

```text
challenge created
→ fresh testnet receiver + ZIP-321 request
→ waiting
→ transaction detected
→ confirming
→ verification response
→ local metro entitlement issued
→ PROVE ACCESS consumes entitlement
→ second use is denied
```

`src/testnet/paymentMachine.ts` owns these transitions. Testnet status polling
alone cannot unlock Metro: the UI must call the verification endpoint, the
response must match the challenge/network/policy/transaction, and the reducer
must issue a one-use entitlement. Network, expiry, amount, provider, or
transaction inconsistencies remove the entitlement and fail closed.

The Vercel API implements:

```text
GET  /api/testnet/health
POST /api/testnet/payment-challenge
GET  /api/testnet/payment-challenge/:challengeId
POST /api/testnet/payment-challenge/:challengeId/verify
GET  /api/testnet/transaction/:txid
```

Payment requests use the active
[ZIP-321](https://zips.z.cash/zip-0321) `zcash:` format. They contain the fresh
receiver and configured amount only—no memo, name, email, phone, game score, or
other application identifier. The external adapter must parse addresses with a
network-aware Zcash library; the Vercel layer additionally rejects recognizable
mainnet prefixes as defense in depth.

Current tooling is intentionally isolated behind `ZcashTestnetGateway`. The
current Z3 stack provides Zebra and Zallet, with standalone Zaino available for
optional light-client/indexer use; see the official
[Zallet guide](https://zcash.github.io/zallet/guide/installation/index.html) and
[Z3 integration-test matrix](https://zcash.github.io/integration-tests/ci/index.html).
The repository's runnable compatibility gateway and its exact prerequisites are
documented in `gateway/README.md`.

Do not point this project at `zcashd`: it does not support NU6.3 and reached its
automatic end-of-support halt on 18 July 2026, as recorded in the official
[zcashd deprecation notice](https://zcash.github.io/zcash/user/deprecation.html).
The supported operator baseline is the current Z3 testnet stack (Zebra +
Zallet; standalone Zaino is optional for external light-client/indexer needs).

No name, phone number, identity document, health information, or other private
personal field belongs in a settlement payload.

## Audience Demo Mode

`/demo` is mobile-first, has short objectives, tap-to-interact, a local session,
and a recoverable 4–6 minute route. It is suitable as the target of a
presentation QR code.

## Presentation Mode

`/present` keeps WATCHER visible on desktop and enlarges the shell for projector
use. Presenter-only shortcuts:

- `R`: reset
- `Shift+N`: advance one deterministic checkpoint

These shortcuts are intentionally not printed in the audience UI.

## Threat Model

ZITY illustrates application-layer data exposure to ordinary services and the
correlation of a repeated identifier. It does not model compromised devices,
browser fingerprinting, network metadata, collusion-resistant cryptography, or
the full behavior of a production identity/authorization system.

## What ZITY Does Not Claim

- Profile Completeness is an educational simulation metric, not a scientific
  anonymity score.
- Predicate-based authorization choices are deterministic simulations, not a
  deployed zero-knowledge proof system.
- The single-use serial is nullifier-inspired; it does not claim native Zcash
  nullifier usage.
- Reduced correlation is not absolute anonymity or guaranteed unlinkability.
- Zcash testnet is not production infrastructure.

## Local Development

Audience mode uses only Vite:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/demo`. To exercise Vercel API functions locally,
copy `.env.example` to `.env.local`, set real server-only values, start the
external gateway first, and use Vercel's local runtime:

```bash
npx vercel dev
```

Never use the Vite-only server as evidence of a real network integration: it
does not execute the `api/` functions.

Validation:

```bash
npm run typecheck
npm test
npm run build
```

## Environment Variables

Copy `.env.example`; it contains placeholders only.

| Variable | Scope | Purpose |
|---|---|---|
| `VITE_NETWORK_MODE` | Browser-visible | Development UX default (`demo` or `testnet`) |
| `ZITY_NETWORK_MODE` | Vercel/server | Enables `demo` or real `testnet` endpoints |
| `ZITY_ZCASH_NETWORK` | Vercel/server | Must be exactly `testnet`; every other value is refused |
| `ZITY_TESTNET_GATEWAY_URL` | Vercel/server | HTTPS origin of the external gateway |
| `ZITY_TESTNET_GATEWAY_TOKEN` | Vercel secret | Bearer credential shared only with the external gateway |
| `ZITY_TESTNET_PAYMENT_AMOUNT` | Vercel/server | Exact decimal ZEC amount, max eight decimals |
| `ZITY_TESTNET_MIN_CONFIRMATIONS` | Vercel/server | Confirmation threshold; default `1` |
| `ZITY_TESTNET_CHALLENGE_TTL_SECONDS` | Vercel/server | Challenge lifetime; default `600` |
| `ZITY_TESTNET_UNLOCK_POLICY` | Vercel/server | `confirmed` (default) or `detected` |
| `ZITY_TESTNET_GATEWAY_TIMEOUT_MS` | Vercel/server | Upstream request timeout |

The external service has a separate configuration listed in
`gateway/.env.example`. Wallet seeds, spending keys, RPC passwords, gateway
tokens, and sensitive viewing material are server-only. Never put any of them in
a `VITE_*` variable because Vite embeds those values into browser code.

`detected` policy can shorten a live presentation, but it does not turn an
unconfirmed transaction into a confirmation: the UI continues to say
“confirmation pending.” `confirmed` is the safer default.

## End-to-End Real Testnet Procedure

This is the acceptance run—not a unit-test substitute:

1. Run a fully synced public Zcash **testnet** node plus the compatible wallet
   backend required by `gateway/README.md`.
2. Fund a separate payer wallet with testnet ZEC (no real-world value).
3. Start one persistent gateway instance and confirm `/v1/health` reports
   `network: testnet`, `providerMode: real`, wallet/indexer available, and synced.
4. Configure the Vercel server variables above with the same amount, policy, and
   confirmation threshold as the gateway. Set `ZITY_NETWORK_MODE=testnet`.
5. Deploy, open `/present`, refresh presenter health, and require every readiness
   check to pass. A mock or unavailable response must display an error.
6. Play through the standard Metro, Cafe, Clinic, Watcher analysis, and Metro
   redesign.
7. Start the checkpoint. Confirm the receiver is fresh and the QR/copy action
   contains the exact displayed ZIP-321 URI and amount.
8. Pay that request from the testnet payer wallet.
9. Observe `WAITING → DETECTED → CONFIRMING → VERIFIED` according to real gateway
   responses. Record the real 64-character txid, confirmations, and block.
10. Confirm verification issues the Metro entitlement and enables `PROVE ACCESS`.
11. Prove access once and verify Metro opens.
12. Try again and verify the same entitlement is rejected as already used.
13. Complete Compare and confirm the real-network proof matches transaction
    lookup; retain the presenter event log as judging evidence.

Resetting a challenge creates a fresh local challenge/receiver and clears the
entitlement; it never deletes blockchain history.

## Vercel Deployment

The repository includes narrow SPA rewrites that leave `/api/testnet/*` to
Vercel Functions. Import it with:

- build command: `npm run build`
- output directory: `dist`
- Node.js runtime: 20 or newer

Add all server variables in the Vercel project settings, scoped to the intended
deployment. Do not configure testnet mode until the external gateway is already
healthy over HTTPS. The functions are stateless proxies; wallet/node software
must not run in Vercel, and no wallet secret belongs there beyond the narrow
gateway authentication credential.

Before exposing real mode publicly, add a Vercel Firewall fixed-window rate
limit for `POST /api/testnet/payment-challenge` (for example, five requests per
minute per source IP, returning `429`) and monitor it during rehearsal. This is
a deployment requirement, not an in-memory Function counter: separate
serverless instances do not share process memory. Vercel documents the current
dashboard flow in its [WAF rate-limiting guide](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Security and Privacy Assumptions

- Zcash settlement privacy and application-layer authorization privacy are
  separate layers. Minimum disclosure does not automatically provide complete
  anonymity.
- A fresh receiver reduces application-level correlation compared with reusing
  one receiver; operators can still observe their own wallet and gateway logs.
- Browser, IP, timing, device, wallet, and network metadata are outside the
  simulated Watcher model.
- The local entitlement is an application authorization, not an NFT, on-chain
  token, native Zcash nullifier, or production zero-knowledge credential.
- The hackathon entitlement is issued and consumed in the browser after a
  validated server response. It is not signed and browser storage is not a
  production authorization boundary; a production verifier must keep or sign
  entitlement state server-side.
- `detected` policy accepts mempool observation risk. `confirmed` reduces that
  risk but adds testnet latency.

## Known Real-Network Limitations

- A real acceptance run requires operator infrastructure, a synced public
  testnet backend, and externally supplied testnet funds; the repository cannot
  manufacture those facts.
- The reference gateway keeps active challenges in process memory. Restarting or
  horizontally scaling it without sticky routing loses challenge lookup. Use a
  durable encrypted store before production-like operation.
- Challenge creation has no repository-local, cross-instance abuse limiter or
  durable idempotency key. Keep real mode private until the required Vercel WAF
  rule is active; a production service should also enforce session idempotency
  in its durable challenge ledger.
- Receiver derivation and incoming shielded transaction discovery vary across
  the evolving Z3/Zallet stack. The adapter boundary is stable, but an operator
  may need to replace the included compatibility adapter as official RPC support
  changes.
- This is hackathon testnet infrastructure, not audited custody software. It must
  never be pointed at mainnet or hold real-value funds.
- The optional completion reward/payout flow is intentionally not implemented;
  the real inbound Metro settlement is the single network integration in scope.

## Asset Structure

The centralized asset manifest is `src/game/assets/manifest.ts`. Phaser attempts
every manifest URL and generates a crisp code-drawn placeholder for any missing
or invalid PNG. Final art can therefore be dropped in without game-logic edits:

```text
public/assets/
 ├── player/
 ├── npc/
 ├── metro/
 ├── cafe/
 ├── clinic/
 ├── club/
 ├── watcher/
 ├── ui/
 ├── effects/
 └── props/
```

Expected filenames and sizing behavior are documented in
`public/assets/README.md`.

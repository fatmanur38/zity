# ZITY

**Live demo:** [z-city.vercel.app/demo](https://z-city.vercel.app/demo) · no signup, wallet, or testnet funds required

ZITY is a playable privacy-by-design simulator. Players complete an ordinary
city route while WATCHER shows how persistent identifiers can connect Metro,
Cafe, Clinic, and Club activity into one profile. They can then redesign the
same interactions and compare what the city can learn in each version.

The core question is simple: **what does this service actually need to know?**

## Problem

Digital services often ask "who are you?" even when the actual requirement is
smaller: a valid ticket, an appointment, or an age threshold. Reusing a stable
account lets separate services correlate activity that was not intended to
form one cross-service profile.

## Product

ZITY turns that design problem into a compact 4–6 minute pixel-city
experience. The React interface explains objectives and WATCHER state while
Phaser owns the world, movement, interactions, click/tap auto-walk, and
destination markers.

Audience mode requires no signup, account, wallet, or testnet funds. Presenter
mode deliberately uses a real, externally verified Zcash testnet payment; it
never relabels a simulated response as a network result.

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
expands the graph and shows that the central problem is not any single
service: the same identifier connected otherwise separate activities and
enabled new inferences.

### 3. Rethink

The player revisits Clinic, Metro, and Club interactions. Each offers three
functionally valid designs rather than one predetermined correct button:

- **Standard:** the requirement is satisfied using a persistent account plus
  additional fields.
- **Hybrid:** a scoped proof is used, but a persistent account is still
  shared.
- **Minimum:** only the predicates the service needs are revealed.

The Metro authorization is also tried twice. Its second use is rejected
without requiring identity exposure, demonstrating that privacy does not
remove system controls.

In real-network mode, the redesigned Metro inserts a settlement checkpoint
before issuing that authorization. A fresh testnet payment request is
created, the transaction is detected and (under the default policy)
confirmed, and only a verified server response can issue the one-use
entitlement.

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

## Controls

**Desktop:** `WASD`/arrows to move, `E` to interact, click a service to
auto-walk and interact, click the world to auto-walk, `Esc` to pause.

**Mobile:** drag the bottom-left joystick to move, tap an active service to
auto-walk and interact, tap the WATCHER bar to open the correlation graph as
a bottom sheet. Portrait is supported without rotation.

## Language Support

All experience text lives in `src/i18n/en.ts` and `src/i18n/tr.ts`. Switching
is instant and saved to `localStorage`; `tr-*` browser locales default to
Turkish on first visit.

## Privacy Model

The deterministic privacy engine (`src/privacy/engine.ts`) distinguishes:

- persistent fields such as account, email, phone, wallet, and device IDs;
- sensitive contextual fields such as a medical relationship;
- low-disclosure predicates such as "valid pass" or "age 18+."

Scenario outcomes are recorded as two comparable tracks: a standard baseline
and the player's redesigned route. Disclosures, account-to-service edges,
cross-service links, inferences, and metrics are derived from those runs
rather than stored as unrelated counters.

Every option still authorizes the requested service. What changes is the data
made available for correlation.

## Watcher Model

WATCHER is the experience's correlation and analysis layer. It shows only
cautious inferences supported by the simulated disclosures — for example,
"possible health-related activity" when a persistent Clinic identifier
becomes linked to other services, never a diagnosis or medical fact. During
redesign, WATCHER also makes removed links and inferences visible.

## Architecture

```text
ZITY
 ├── React UI / Router / i18n / testnet checkpoint UI
 ├── Phaser pixel world + interaction abstraction
 ├── Scenario registry + deterministic privacy engine
 ├── Typed payment machine + one-use entitlement
 └── same-origin /api/testnet  (Vercel Functions)
      └── ZcashTestnetGateway interface
           ├── PublicExplorerProvider   → public testnet explorer (no node)
           └── HttpZcashTestnetGateway  → self-hosted Zebra + Zallet gateway
```

The browser never talks to a wallet, node, or explorer directly — every
request goes through the same-origin API, which validates the response
against a strict shared contract (`src/testnet/contracts.ts`) before
returning it to the game. `ZITY_TESTNET_PROVIDER` selects which
implementation serves that contract; nothing downstream changes.

## Demo vs Real Network

| | Audience demo | Real testnet |
|---|---|---|
| Route | `/demo` | `/present` or `/demo?network=testnet` |
| Provider label | `DEMO` | `ZCASH TESTNET` only after a real health response |
| Wallet/funds | Not required | Testnet ZEC and a paying wallet required |
| Metro entitlement | Deterministic local entitlement | Issued only after server verification |
| Failure behavior | Playable offline simulation | Fails closed; no mock fallback |

The browser route selects the experience mode. The server's
`ZITY_NETWORK_MODE` is the sole authority for whether real endpoints are
enabled — a query string can never turn a demo-configured server into a real
provider.

## Real Zcash Testnet Integration

Zcash is infrastructure for the redesigned Metro checkpoint, not the story of
the first half of the game. The real path is:

```text
challenge created
→ payment request (ZIP-321)
→ waiting
→ transaction detected
→ confirming
→ verification response
→ local metro entitlement issued
→ PROVE ACCESS consumes entitlement
→ second use is denied
```

`src/testnet/paymentMachine.ts` owns these transitions. Status polling alone
cannot unlock Metro: the UI must call the verification endpoint, the
response must match the challenge/network/policy/transaction, and the
reducer must issue a one-use entitlement. Any inconsistency removes the
entitlement and fails closed.

The same-origin API implements:

```text
GET  /api/testnet/health
POST /api/testnet/payment-challenge
GET  /api/testnet/payment-challenge/:challengeId
POST /api/testnet/payment-challenge/:challengeId/verify
GET  /api/testnet/transaction/:txid
```

Payment requests use the active [ZIP-321](https://zips.z.cash/zip-0321)
`zcash:` format and contain only the receiver and amount — no memo, name,
email, phone, game score, or other identifier.

**Two interchangeable providers implement the verification contract:**

- **`explorer`** (default in this repo's live demo) verifies payments
  against a public Zcash testnet block explorer. No node, no wallet, no
  chain sync — a fresh receiver address can be generated with
  `npm run testnet:address`. Best for demos and reviews.
- **`gateway`** runs against a self-hosted Zebra + Zallet stack
  (`gateway/`), supports shielded receivers, and doesn't depend on a
  third-party explorer.

Full setup for both is in **[`docs/TESTNET_SETUP.md`](docs/TESTNET_SETUP.md)**.
`gateway/README.md` covers the self-hosted stack in more depth, including
why `zcashd` is unsupported (no NU6.3, end-of-support July 2026) and the
current Z3 (Zebra + Zallet) operator baseline.

No name, phone number, identity document, health information, or other
private personal field belongs in a settlement payload.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/demo`. The dev server serves `/api/testnet/*`
itself — the same handlers Vercel runs in production — so no separate CLI or
account is needed to exercise the real-network path locally. To do so, copy
`.env.example` to `.env` and follow
**[`docs/TESTNET_SETUP.md`](docs/TESTNET_SETUP.md)**.

Validation:

```bash
npm run typecheck
npm test
npm run build
```

## Environment Variables

Copy `.env.example`; it contains placeholders only. Full variable reference
and setup walkthrough: **[`docs/TESTNET_SETUP.md`](docs/TESTNET_SETUP.md)**.

| Variable | Scope | Purpose |
|---|---|---|
| `VITE_NETWORK_MODE` | Browser-visible | UX default only (`demo` or `testnet`); never a trust boundary |
| `ZITY_NETWORK_MODE` | Server | Enables `demo` or real `testnet` endpoints |
| `ZITY_TESTNET_PROVIDER` | Server | `explorer` (no node) or `gateway` (self-hosted) |
| `ZITY_TESTNET_PAYMENT_AMOUNT` | Server | Exact decimal ZEC amount, max 8 decimals |
| `ZITY_TESTNET_MIN_CONFIRMATIONS` | Server | Confirmation threshold; default `1` |
| `ZITY_TESTNET_UNLOCK_POLICY` | Server | `confirmed` (default, safer) or `detected` |

Wallet seeds, spending keys, RPC passwords, and gateway tokens are
server-only. Never put any of them in a `VITE_*` variable — Vite embeds
those into browser code.

## Deployment

The live demo runs on Vercel with narrow SPA rewrites that leave
`/api/testnet/*` to Vercel Functions:

- build command: `npm run build`
- output directory: `dist`
- Node.js runtime: 20+

Server env vars go in the Vercel project settings, never in a `VITE_*`
variable. In `explorer` mode, no wallet or node software runs anywhere in
the deployment. In `gateway` mode, wallet/node software must run outside
Vercel — Functions only proxy to it.

Before exposing real mode publicly, rate-limit
`POST /api/testnet/payment-challenge` (for example, 5 requests/minute per
IP via [Vercel's WAF](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)).

## Security and Privacy Assumptions

- Zcash settlement privacy and application-layer authorization privacy are
  separate layers. Minimum disclosure does not automatically provide
  complete anonymity.
- Browser, IP, timing, device, and network metadata are outside the
  simulated Watcher model.
- The local entitlement is an application authorization, not an NFT,
  on-chain token, native Zcash nullifier, or production zero-knowledge
  credential. It is issued and consumed in the browser after a validated
  server response, is unsigned, and is not a production authorization
  boundary — a production verifier must keep or sign entitlement state
  server-side.
- `detected` unlock policy accepts mempool-observation risk; `confirmed`
  reduces that risk but adds testnet latency.

## Threat Model

ZITY illustrates application-layer data exposure to ordinary services and the
correlation of a repeated identifier. It does not model compromised devices,
browser fingerprinting, network metadata, collusion-resistant cryptography,
or the full behavior of a production identity/authorization system.

## What ZITY Does Not Claim

- Profile Completeness is an educational simulation metric, not a scientific
  anonymity score.
- Predicate-based authorization choices are deterministic simulations, not a
  deployed zero-knowledge proof system.
- The single-use entitlement is nullifier-inspired; it does not claim native
  Zcash nullifier usage.
- Reduced correlation is not absolute anonymity or guaranteed
  unlinkability.
- Zcash testnet is not production infrastructure, and testnet ZEC has no
  monetary value.

## Known Limitations

- The `explorer` provider is stateless by design: txid reuse across
  challenges isn't server-enforced (a unique per-challenge amount makes
  collisions impractical, but not structurally prevented). The `gateway`
  provider's in-memory ledger has the same single-process caveat — see
  `gateway/README.md`.
- Both providers depend on external infrastructure (a public explorer, or a
  self-hosted node) being reachable; neither falls back to a mock if it
  isn't.
- The optional completion reward/payout flow is intentionally not
  implemented; the real inbound Metro payment is the network integration in
  scope.

## Assets

The centralized manifest is `src/game/assets/manifest.ts`. Phaser attempts
every manifest path at startup and generates a crisp code-drawn placeholder
for anything missing, so the game never breaks on missing art. See
[`public/assets/README.md`](public/assets/README.md) for the current file
list and sizing convention.

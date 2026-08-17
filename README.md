# ZITY

ZITY is a playable privacy-by-design simulator. Players complete an ordinary
morning route while WATCHER shows how persistent identifiers can connect Metro,
Cafe, Clinic, and Club activity into one profile.

The core question is simple: **what does this service actually need to know?**

## Problem

Digital services often ask “who are you?” even when the actual requirement is
smaller: a valid ticket, an appointment, or an age threshold. Reusing a stable
account lets separate services correlate activity that was not intended to form
one cross-service profile.

## Product

ZITY turns that design problem into a compact 2–4 minute pixel-city experience.
The React interface explains objectives and WATCHER state while Phaser owns the
world, movement, interactions, click/tap auto-walk, and destination markers.

No signup, account, wallet, or testnet funds are required.

## Why This Matters

Data minimization is easier to understand when its consequences are visible.
ZITY contrasts a persistent account with scoped requirement proofs, without
framing privacy as invisibility or making cryptocurrency the story.

## Demo Flow

1. Spawn and buy a Metro ticket.
2. Connect account `A827`; WATCHER discovers a persistent identity.
3. Reuse it at Cafe and Clinic; WATCHER correlates the services.
4. Unlock Minimum Disclosure after the Clinic turning point.
5. Prove a valid pass without exposing a persistent identifier.
6. Retry the simulated single-use authorization and see it rejected.
7. Solve the Club age/ticket disclosure choice.
8. Review results, then switch perspective and attempt correlations as WATCHER.

The first production checkpoint—Spawn → Metro → Watcher—is independently
playable and uses the same systems as the rest of the route.

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

Every score change has a human-readable reason. The guided standard path moves
from 3% to 17%, 34%, and 61% as the same account becomes more correlatable.
Predicate-only interactions do not materially increase it.

## Watcher Model

WATCHER is a correlation engine, not an evil hacker. It only shows cautious
inferences supported by the simulated disclosures. For example, it reports
“possible health-related activity” after a persistent account appears at a
Clinic, not a diagnosis or medical fact.

## Architecture

```text
ZITY
 ├── React UI / Router / i18n
 ├── Phaser pixel world
 ├── Interaction + input abstraction
 ├── Deterministic privacy engine
 ├── Scoped authorization simulation
 └── SettlementProvider
      ├── MockSettlementProvider
      └── ZcashTestnetSettlementProvider
```

Zustand stores the local session. No persistent server database is required.

## Zcash Integration

Zcash is an optional settlement rail behind the `SettlementProvider` interface.
Audience mode defaults to deterministic mock settlement. Testnet mode expects an
operator-controlled HTTP adapter; the browser does not connect directly to a
node and gameplay must not wait for blockchain confirmation.

No name, phone number, identity document, health information, or other private
personal field belongs in a settlement payload.

## Audience Demo Mode

`/demo` is mobile-first, has short objectives, tap-to-interact, a local session,
and a recoverable guided route. It is suitable as the target of a presentation
QR code.

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
- The minimum-disclosure flow is a deterministic UI simulation, not a deployed
  zero-knowledge proof system.
- The single-use serial is nullifier-inspired; it does not claim native Zcash
  nullifier usage.
- Reduced correlation is not absolute anonymity or guaranteed unlinkability.
- Zcash testnet is not production infrastructure.

## Local Development

```bash
npm install
npm run dev
```

Validation:

```bash
npm run typecheck
npm test
npm run build
```

## Environment Variables

Copy `.env.example` when enabling a non-default provider.

```text
VITE_SETTLEMENT_MODE=mock
VITE_ZCASH_API_URL=
```

Use `VITE_SETTLEMENT_MODE=zcash-testnet` only with a real external testnet
adapter. Never put secrets in `VITE_*` variables; Vite exposes them to clients.

## Vercel Deployment

The repository includes `vercel.json` SPA rewrites. Import the repository into
Vercel with the defaults:

- build command: `npm run build`
- output directory: `dist`

No persistent database or server session is required.

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

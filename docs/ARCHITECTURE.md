# Architecture

ZITY is a single-page React app with a Phaser scene embedded in it, plus a
thin serverless API used only for real-testnet payments.

The guiding constraint: **the game never talks to Zcash directly.** All chain
access goes through same-origin serverless functions. This is not stylistic —
public explorer APIs reject cross-origin browser requests, and a browser is
the wrong place for a challenge secret.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  React UI          pages/, components/, i18n/               │
│  ─ landing, HUD, dialogs, WATCHER panel, testnet checkout   │
├─────────────────────────────────────────────────────────────┤
│  State             stores/gameStore.ts   (Zustand)          │
│  ─ single source of truth: stage, runs, choices, payment    │
├──────────────────────────┬──────────────────────────────────┤
│  Privacy simulation      │  Game world                      │
│  privacy/                │  game/                           │
│  ─ scenarios, exposure   │  ─ Phaser scene, sprites, input  │
│    scoring, comparison   │                                  │
├──────────────────────────┴──────────────────────────────────┤
│  Testnet client    testnet/  (state machine, polling)       │
└──────────────────────────────┬──────────────────────────────┘
                               │ same-origin HTTP
┌──────────────────────────────▼──────────────────────────────┐
│  Serverless API    api/testnet/*   (Vercel functions)       │
│  ─ challenge issuing, payment verification, health          │
├─────────────────────────────────────────────────────────────┤
│  Provider (one of two, chosen by env)                       │
│    explorer → public testnet explorer   (no node)           │
│    gateway  → your Zebra + Zallet stack (gateway/)          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                        Zcash testnet
```

## Directory map

| Path | Contains |
| --- | --- |
| `src/pages/` | Route-level components (landing, game, about, architecture) |
| `src/components/` | HUD, dialogs, WATCHER panel/graph, testnet checkout UI |
| `src/stores/gameStore.ts` | Zustand store — the entire game state machine |
| `src/privacy/` | Scenario registry and the exposure/correlation engine |
| `src/game/` | Phaser: scene, asset manifest and loader, input, interactables |
| `src/testnet/` | Client-side payment state machine, polling, network mode |
| `src/i18n/` | English and Turkish dictionaries, typed by key |
| `src/types/game.ts` | Shared domain types (`StoryStage`, `InteractionId`, …) |
| `api/testnet/` | HTTP route handlers (file-system routed) |
| `api/_lib/` | Providers, config validation, error envelope |
| `gateway/` | Optional self-hosted Zebra + Zallet service |
| `docs/` | This documentation |

The `_lib` prefix keeps shared code out of Vercel's route table — only files
under `api/testnet/` become endpoints.

## State: one store, one stage machine

`src/stores/gameStore.ts` holds everything: the current stage, the baseline
and redesigned scenario runs, design choices, the authorization ledger, and
the testnet payment session.

The experience is a linear stage machine (`StoryStage` in
`src/types/game.ts`):

```
spawn → metro-ticket → metro-gate → cafe → clinic
      → perspective-shift                          ← the reveal
      → clinic-rethink → clinic-compare
      → metro-rethink  → metro-checkpoint → metro-compare → metro-reuse
      → club → club-compare
      → results
```

Every transition is a store action that validates the current stage before
acting — `connectClinic()` is a no-op unless `stage === "clinic"`. Illegal
transitions are impossible rather than merely unlikely.

The first pass (`spawn`…`clinic`) builds the **baseline** runs. After
`perspective-shift`, `beginRethink()` clones those runs into `redesignedRuns`
so the same day can be replayed with different disclosure choices, and the
two compared side by side.

## Privacy simulation

`src/privacy/scenarios.ts` is a registry: each service (metro, clinic, club)
declares its design options, what each option discloses, and the resulting
outcome copy. `src/privacy/engine.ts` turns a list of runs into an
`ExposureProfile` — an exposure score, the cross-service links, and the
inferences those links support.

This is deterministic and testable (`engine.test.ts`), and it is **a teaching
model, not cryptography**. It shows *why* minimising disclosure matters; it
does not implement the primitives that achieve it. See
[Zcash Integration](ZCASH_INTEGRATION.md) for what is genuinely on-chain.

## Game world

`src/game/scenes/MainScene.ts` is the only Phaser scene. It reads the store
each frame and reacts: which interactables are active for the current stage,
whether the analysis overlay should be showing, where the camera should look.

Interactables are data, not code — `src/game/interactables/definitions.ts`
declares each one's position, interaction point and radius, and the stages it
is active in. Adding a service means adding an entry, not writing scene logic.

Two things worth knowing before editing the scene:

- **Resize comes from a `ResizeObserver`** on the canvas parent, not from
  window events, because Phaser's `RESIZE` scale mode does not reliably pick
  up orientation changes on mobile. The scene also calls `setSize` on the
  camera explicitly.
- **Camera effects need exact ease names.** `camera.pan()` and
  `camera.zoomTo()` look the ease up in Phaser's `EaseMap` directly and leave
  it undefined on a miss, then throw from inside `CameraManager.update` on
  every frame — which aborts the scene update loop entirely. Tweens are
  forgiving because they normalise the name first. Use `"Sine.easeInOut"`,
  never `"Sine.inOut"`, for camera effects.

## Testnet client

`src/testnet/` owns the browser side of payment. `paymentMachine.ts` is a
pure reducer over payment transitions — deduplicated by event id, so repeated
polls cannot double-apply. `useMetroTestnetController.ts` drives it: create
challenge, poll status, verify, issue a single-use entitlement.

The entitlement is deliberately `maxUses: 1`. Later in the game the player is
invited to reuse it, and is refused — that refusal is a teaching moment about
replay, not an error.

## API and providers

Four endpoints under `api/testnet/`, documented in [API Reference](API.md).
Each one validates its input with a Zod schema shared with the client
(`src/testnet/contracts.ts`), so the contract cannot drift between the two
sides.

`api/_lib/testnetProvider.ts` picks the implementation from
`ZITY_TESTNET_PROVIDER`:

| Provider | Backing | Receiver | Trade-off |
| --- | --- | --- | --- |
| `explorer` | Public testnet explorer | Transparent only | Zero infrastructure; payment rail is publicly visible |
| `gateway` | Your Zebra + Zallet | Sapling shielded | Real shielded receipts; you run and sync a node |

Both prove payments against the real chain. **Neither falls back to a mock** —
if the chain is unreachable, the API reports an error rather than pretending.

## Configuration boundary

`VITE_`-prefixed variables reach the browser and are UX defaults only —
never a trusted assertion that a network is available. Everything the server
trusts is unprefixed and validated at startup in `api/_lib/config.ts`, which
rejects a bad configuration loudly instead of degrading quietly.

`ZITY_TESTNET_CHALLENGE_SECRET` must never be given a `VITE_` prefix. Each
challenge derives its unique payment amount from it; leaking it to the
browser would let a client forge attribution.

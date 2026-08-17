# Contributing

## Before you push

```bash
npm run build      # tsc -b, then bundle — catches type errors
npm test           # 53 app tests + 25 gateway tests
```

Both must pass. `npm run build` type-checks the app *and* the API; running
only `npm run typecheck` skips the bundle step where some issues surface.

## Testing

| Command | Scope | Runner |
| --- | --- | --- |
| `npm run test:app` | `src/`, `api/` | Vitest |
| `npm run test:gateway` | `gateway/` | Node's built-in test runner |
| `npm test` | Both | — |

Test files live beside their subject (`engine.ts` → `engine.test.ts`).

What is covered today: the privacy engine, the game store's stage machine,
the testnet payment state machine, network-mode resolution, controller
policy, and both testnet providers. What is not: the Phaser scene and the
React components, which are verified by driving a real browser.

### Verifying UI and game changes

There is no component test suite, so **run the app and look at it.** For the
Phaser scene especially, a change can type-check, build, and still break the
game at runtime.

`/present` mode makes this fast: `Shift`+`N` jumps to the next stage
checkpoint, so you can reach a late-game state in seconds instead of
replaying the whole flow.

When checking a scene change, watch the browser console. Phaser failures
frequently surface as a repeating error rather than a crash — see the trap
below.

## Traps worth knowing

These have each cost real debugging time.

**Camera effects need exact ease names.** `camera.pan()` and
`camera.zoomTo()` look the ease up in Phaser's `EaseMap` directly and leave
`ease` undefined on a miss — no fallback. The effect then throws
`this.ease is not a function` from inside `CameraManager.update` on **every
frame**, which aborts `Systems.step` before `MainScene.update()` runs. The
symptom is a frozen, unresponsive player, not an obvious crash.

Use `"Sine.easeInOut"`. Tweens accept `"Sine.inOut"` because
`GetEaseFunction` normalises the name first; camera effects do not.

**API imports need `.js` extensions.** Vercel runs handlers as plain Node
ESM. `moduleResolution: "Bundler"` hides this locally. See
[Deployment](DEPLOYMENT.md).

**Never prefix a secret with `VITE_`.** Anything so prefixed is inlined into
the browser bundle.

**CSS load order beats source order.** `main.tsx` imports `styles.css`, then
`styles-redesign.css`, then `experience-redesign.css`. A rule in an earlier
file cannot override an equally specific rule in a later one, no matter where
you put it in the file. The mobile `grid-template-rows` for `.game-page`
lives in `experience-redesign.css` for exactly this reason.

## Code layout conventions

**State changes go through the store.** `src/stores/gameStore.ts` is the
single source of truth. Store actions validate the current stage before
acting, which is what makes illegal transitions impossible rather than merely
unlikely. Keep that pattern.

**Interactables are data.** To add or move a service, edit
`src/game/interactables/definitions.ts` — position, interaction point,
radius, and the stages it is active in. Avoid special-casing in the scene.

**Client and server share one contract.** `src/testnet/contracts.ts` holds
the Zod schemas both sides use. Change the schema, not one side's assumptions.

**Every user-facing string is a translation key.** Add to both
`src/i18n/en.ts` and `src/i18n/tr.ts`. `tr.ts` is typed
`Record<TranslationKey, string>` against `en.ts`, so a missing or stale key
is a type error — English is the source of truth.

## Adding a redesign scenario

1. Add an entry to `scenarioRegistry` in `src/privacy/scenarios.ts` — options,
   what each discloses, outcome copy
2. Add its translation keys to `en.ts` and `tr.ts`
3. Add the stages to `StoryStage` in `src/types/game.ts`
4. Add the store actions and transitions in `gameStore.ts`
5. Add an interactable entry with the new stages
6. Render it from `InteractionModal.tsx`

Steps 3–4 are where bugs hide: a stage that no interactable is active in
leaves the player with nothing to do, and an interaction that opens with no
matching dialog sets `currentInteraction` while rendering nothing — which
freezes movement with no visible cause.

## Assets

Sprites live in `public/assets/` and are declared in
`src/game/assets/manifest.ts`. A manifest entry pointing at a missing file
fails the load; remove the entry when you remove the art.

Keep the payload small — this runs on phones over mobile networks.

## Commits

Explain **why**, not just what. The interesting part of a fix is the cause
and how it was verified, not the diff — the diff is already in the commit.

## Reporting a bug

Include the stage you were in (`/present` + `Shift`+`N` count is a precise
way to say it), the browser console output, and whether you were in demo or
testnet mode.

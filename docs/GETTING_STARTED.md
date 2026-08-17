# Getting Started

Clone, install, run. Demo mode needs no configuration at all — no wallet, no
node, no `.env`.

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | `^20.19.0` or `>=22.12.0` | Required by Vite 7 |
| npm | 10+ | Ships with Node 20/22 |

Nothing else. No Docker, no database, no Zcash node — those are only needed
for the optional self-hosted gateway ([Testnet Setup](TESTNET_SETUP.md)).

Check your Node version first, because an older Node fails with a confusing
Vite error rather than a clear one:

```bash
node -v      # must be >= 20.19.0
```

## Install and run

```bash
git clone https://github.com/fatmanur38/zity.git
cd zity
npm ci                 # or: npm install
npm run dev
```

Open <http://localhost:5173>. The landing page offers two entry points; pick
**Play the demo** and you are in.

`npm ci` is the reproducible install — it honours `package-lock.json`
exactly. Use `npm install` only when you intend to change dependencies.

### Verify your checkout

```bash
npm run build          # type-checks with tsc -b, then bundles
npm test               # 53 app tests + 25 gateway tests
```

Both should pass on a clean clone with no configuration. If they do not, the
problem is your environment, not your setup — check Node's version first.

## What you can do without any configuration

- Play the full experience end to end, in English or Turkish
- Use the **demo** payment path (simulated, clearly labelled as such)
- Run every test
- Build and deploy a static demo-mode site

## Routes

| Route | What it is |
| --- | --- |
| `/` | Landing page |
| `/demo` | The game |
| `/demo?network=testnet` | The game, requesting real testnet mode |
| `/present` | Presentation mode — see shortcuts below |
| `/about` | Product explanation |
| `/architecture` | In-app architecture walkthrough |

## Controls

**Desktop** — `WASD`/arrows to move, `E` to interact, click a service to
auto-walk to it and interact, click the world to auto-walk, `Esc` to pause.

**Mobile** — drag the bottom-left joystick, tap an active service to auto-walk
and interact, tap the WATCHER bar to open the correlation graph as a bottom
sheet. Landscape is the intended orientation; portrait shows a rotate prompt
while the game keeps running underneath.

### Presentation mode (`/present`)

Useful for live demos and for jumping straight to a specific stage while
developing.

| Key | Action |
| --- | --- |
| `Shift` + `N` | Advance to the next stage checkpoint |
| `R` | Reset the run |
| `H` | Toggle the network inspector |
| `Esc` | Pause |

`Shift`+`N` is the fastest way to reach a late-game stage without replaying
the whole flow.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server, including the `/api/testnet/*` routes |
| `npm run build` | `tsc -b` then `vite build` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Types only, no bundle |
| `npm test` | App tests then gateway tests |
| `npm run test:app` | Vitest over `src` and `api` |
| `npm run test:gateway` | Node's built-in test runner over `gateway` |
| `npm run testnet:address` | Generate a testnet transparent address + WIF |

The dev server serves the serverless functions too. `vite.config.ts` contains
a small plugin that mirrors Vercel's file-system routing, so `/api/testnet/*`
behaves the same locally as in production — you do not need `vercel dev`.

## Enabling real testnet mode

Demo mode is the default. To pay the metro fare with a real testnet
transaction, follow [Testnet Setup](TESTNET_SETUP.md). In short:

1. Copy `.env.example` to `.env`
2. Set `ZITY_NETWORK_MODE=testnet` and `VITE_NETWORK_MODE=testnet`
3. Choose a provider — `explorer` (no node) or `gateway` (your own Zebra +
   Zallet)
4. For `explorer`, set a testnet **transparent** receiving address and a
   challenge secret

Then check it is live:

```bash
curl http://localhost:5173/api/testnet/health
```

`providerMode: "real"` with a non-null `blockHeight` means you are talking to
the real chain. `providerMode: "mock"` means testnet mode is still off.

## Troubleshooting

**Vite fails to start with a syntax or export error.** Almost always a stale
dependency cache after a version change. `rm -rf node_modules/.vite` and
restart; if that does not fix it, `rm -rf node_modules && npm ci`.

**`npm run build` fails on a relative import in `api/`.** Serverless handlers
run as plain Node ESM, which requires explicit `.js` extensions on relative
imports — even from `.ts` files. Add the extension. Local type-checking uses
`moduleResolution: "Bundler"` and will not catch this, but the production
build will.

**The health endpoint returns `providerMode: "mock"`.** `ZITY_NETWORK_MODE`
is not `testnet`, or your `.env` is not being loaded. Restart the dev server
after editing `.env`.

**Testnet mode refuses to start with a shielded receiver.** Expected in
`explorer` mode: a public explorer cannot read shielded outputs, so the
config rejects `z`/unified addresses at startup rather than failing later.
Use a transparent `tm…`/`t2…` address, or switch to the `gateway` provider.

**The game canvas is blank or the wrong size on a phone.** Check that the
canvas element's parent has a non-zero size; the scene resizes from a
`ResizeObserver` on that parent, not from window events.

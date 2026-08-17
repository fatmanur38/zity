# Deployment

ZITY deploys to Vercel: the Vite build serves the static app, and the files
under `api/` become serverless functions automatically.

Nothing here is Vercel-specific except the function runtime. Demo mode is a
pure static build and will run on any static host.

## Demo mode (static, no backend)

```bash
npm ci
npm run build          # → dist/
```

Serve `dist/` anywhere. Because the app is client-routed, the host must
rewrite unknown paths to `index.html` — `vercel.json` already does this for
`/demo`, `/present`, `/about` and `/architecture`.

No environment variables are required. `VITE_NETWORK_MODE` defaults to
`demo`.

## Vercel

### First deploy

```bash
npm i -g vercel
vercel login
vercel --prod
```

Vercel detects Vite and needs no build configuration.

### Connecting GitHub (recommended)

Linking the repo at
`https://vercel.com/<team>/<project>/settings/git` makes every push to `main`
deploy automatically. This is worth doing once — it removes the manual alias
step described below, which is easy to forget.

### Environment variables

Set these in **Project → Settings → Environment Variables**, not in a
committed file. Only needed for real testnet mode:

| Variable | Scope | Notes |
| --- | --- | --- |
| `ZITY_NETWORK_MODE` | Server | `testnet` to enable |
| `ZITY_ZCASH_NETWORK` | Server | Must be `testnet` |
| `ZITY_TESTNET_PROVIDER` | Server | `explorer` or `gateway` |
| `ZITY_TESTNET_RECEIVER_ADDRESS` | Server | Transparent `tm…`/`t2…` for `explorer` |
| `ZITY_TESTNET_CHALLENGE_SECRET` | Server | `openssl rand -hex 32` |
| `VITE_NETWORK_MODE` | Build | UX default only |

Full list and meanings: [`.env.example`](../.env.example) and
[Testnet Setup](TESTNET_SETUP.md).

**Never give a secret a `VITE_` prefix.** Anything so prefixed is inlined
into the browser bundle at build time. `ZITY_TESTNET_CHALLENGE_SECRET` in
particular controls payment attribution.

Redeploy after changing variables — they are read at build and invocation
time, not live.

### Custom domain / alias

```bash
vercel alias set https://<deployment-url> your-domain.vercel.app
```

⚠️ **A production deploy does not always move an existing alias.** If the live
URL still serves an old bundle after a successful deploy, the alias is
pointing at the previous deployment. Re-run `vercel alias set` with the new
deployment URL. Connecting GitHub avoids this entirely.

Verify which bundle is actually live:

```bash
curl -s https://your-domain.vercel.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
```

Compare it with the filename from your local `npm run build` output.

### Deployment protection

A new Vercel project may sit behind SSO, which returns an auth wall to
reviewers. If teammates report a login prompt, check **Settings → Deployment
Protection** and disable it for the deployment types you want public.

## Verifying a deployment

```bash
curl -s https://your-domain/api/testnet/health
```

- `providerMode: "mock"` → demo mode; nothing touches the chain
- `providerMode: "real"` + live `blockHeight` → genuinely on-chain

Then open the site and confirm the landing page offers both entry points.

## The one deployment trap worth knowing

Vercel runs API handlers as **plain Node ESM**, which requires explicit `.js`
extensions on relative imports — even in TypeScript sources:

```ts
import { testnetServerConfig } from "../_lib/config.js";   // ✅
import { testnetServerConfig } from "../_lib/config";      // ❌ fails at runtime
```

Local type-checking uses `moduleResolution: "Bundler"`
([`tsconfig.api.json`](../tsconfig.api.json)) and will **not** flag the second
form, so it passes locally and fails in production with
`ERR_MODULE_NOT_FOUND` / `FUNCTION_INVOCATION_FAILED`.

If Vercel's build log shows TypeScript error **TS2835**, that is this problem.
Do not dismiss it.

## Self-hosting the gateway

Only needed for shielded (`gateway`) mode. It is a separate long-running
service with its own Dockerfile and requires a synced Zebra + Zallet stack —
tens of GB and hours of initial sync. See [`gateway/README.md`](../gateway/README.md).

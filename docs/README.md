# ZITY Documentation

ZITY is a playable privacy-by-design simulator. You walk an ordinary morning
through a city — metro, cafe, clinic — watch the links those services create
about you, then redesign the same flows to reveal less and compare the result.

The metro fare can be paid on the **real Zcash testnet**, or in a wallet-free
demo mode.

## Start here

| If you want to… | Read |
| --- | --- |
| Clone it and get it running | [Getting Started](GETTING_STARTED.md) |
| Understand how the pieces fit | [Architecture](ARCHITECTURE.md) |
| See exactly which Zcash features are used, and where | [Zcash Integration](ZCASH_INTEGRATION.md) |
| Connect it to the real Zcash testnet | [Testnet Setup](TESTNET_SETUP.md) |
| Call the payment API directly | [API Reference](API.md) |
| Ship it somewhere | [Deployment](DEPLOYMENT.md) |
| Change the code | [Contributing](CONTRIBUTING.md) |

For the product story — the problem, the privacy model, what ZITY does *not*
claim — see the [root README](../README.md).

## The short version

```bash
git clone https://github.com/fatmanur38/zity.git
cd zity
npm install
npm run dev            # http://localhost:5173
```

That runs the full experience in demo mode. **No wallet, no node, no API
keys, no .env file.** Real testnet mode is opt-in and documented separately.

## Two ways to run the payment step

|  | Demo mode | Testnet mode |
| --- | --- | --- |
| Wallet needed | No | Yes (testnet ZEC) |
| Backend needed | No | Serverless functions under `api/` |
| Chain interaction | Simulated locally | Real transaction, real confirmations |
| Setup time | Zero | ~15 minutes ([Testnet Setup](TESTNET_SETUP.md)) |
| Good for | Demos, review, teaching | Proving the integration is real |

Demo mode is the default because the experience is the point; the chain is
the proof. Nothing in demo mode pretends to be on-chain — the UI labels it.

## A note on scope

The privacy mechanics in the game (exposure scoring, correlation graph,
minimum-disclosure redesign) are a **deterministic simulation** designed to
teach. They are not Zcash cryptography. The Zcash integration is real, and it
lives in the payment and access-control layer — see
[Zcash Integration](ZCASH_INTEGRATION.md) for the precise boundary.

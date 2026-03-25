# Prediction Market — Web app

Frontend for the Prediction Market program on Solana. Connect a wallet, create and browse markets, and use the **Docs** section for SDK and integration instructions.

## Run locally

From the Anchor workspace root:

```bash
# Build program and IDL (so the web app can load the IDL)
anchor build

# Copy IDL into the web app (if not already present)
cp target/idl/prediction_market.json app/web/public/idl/

# Install and run the web app
cd app/web && yarn install && yarn dev
```

Open [http://localhost:5173](http://localhost:5173). Connect a Solana wallet (e.g. Phantom, Solflare) on **devnet** (default RPC: `https://api.devnet.solana.com`).

## Environment

- `VITE_RPC_ENDPOINT` — RPC URL (default: devnet).
- `VITE_COLLATERAL_MINT` — Optional collateral mint pubkey for new markets (default: wrapped SOL).

## Features

- **Landing** — Connect wallet to continue.
- **Markets** — Browse markets (list populated when indexer or on-chain fetch is added).
- **Creator** — Markets you created.
- **Judges** — Markets where you are a resolver.
- **Create market** — Create a new market (step 1: market + vault).
- **Platform** — Global config and allowed collateral mints (authority only).
- **Docs** — SDK setup, usage examples, PDA reference, and program ID. Visible to everyone (no wallet required).

## SDK & integration

The **Docs** page in the app is the main place for integration instructions: how to use the TypeScript SDK, create markets, mint sets, resolve, and redeem. The SDK lives in `app/sdk` in this repo; see `app/sdk/README.md` for full details.

# Prediction market (Anchor + web)

Anchor is configured to use **Yarn** (`Anchor.toml` → `package_manager = "yarn"`).

## Web app (`app/web`)

```bash
cd app/web
yarn install
yarn dev
```

Build:

```bash
yarn build
```

Prefer **Node 22+** (current LTS).

## Program tests (from repo root `prediction_market/`)

```bash
yarn install   # root dependencies + anchor test script
anchor test
```

The Anchor test script runs: `yarn run ts-mocha … tests/prediction_market.ts tests/edge-cases.ts`.

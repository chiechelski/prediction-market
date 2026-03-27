# Prediction Market — Web App

Frontend for the Prediction Market Solana program. Built with React 18 + Vite + TypeScript + Tailwind CSS. Connects to any Solana cluster via wallet adapter (Phantom, Solflare).

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Run Locally](#run-locally)
3. [Environment](#environment)
4. [Current State — What Exists](#current-state--what-exists)
5. [What Needs to Be Implemented](#what-needs-to-be-implemented)
6. [Page-by-Page Breakdown](#page-by-page-breakdown)
7. [Data & State Management](#data--state-management)
8. [On-Chain Capabilities (Program + SDK)](#on-chain-capabilities-program--sdk)
9. [Trading model & UX roadmap](#trading-model--ux-roadmap)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite 5 |
| Language | TypeScript |
| Routing | react-router-dom v6 |
| Styling | Tailwind CSS 3 (custom theme: `surface-*`, `brand-*`), Outfit font |
| Solana | `@solana/web3.js`, `@solana/spl-token`, `@coral-xyz/anchor` 0.31 |
| Wallets | `@solana/wallet-adapter-react` — Phantom, Solflare |
| State | Local `useState`/`useEffect`; `localStorage` for network selection, custom RPCs, and market registry |
| No external state lib | No Redux / Zustand / React Query |

---

## Run Locally

From the Anchor workspace root:

```bash
# Build program and IDL (so the web app can load the IDL)
anchor build

# Copy IDL into the web app
cp target/idl/prediction_market.json app/web/public/idl/

# Install and run the web app
cd app/web && yarn install && yarn dev
```

Open [http://localhost:5173](http://localhost:5173). Connect a wallet on **devnet** (default RPC: `https://api.devnet.solana.com`).

---

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `VITE_RPC_ENDPOINT` | devnet | Override RPC for the Solana `Connection`. When set, the in-app network switcher is ignored for the actual connection. |
| `VITE_COLLATERAL_MINT` | wrapped SOL | Pre-fill collateral mint in the Create Market form. |

---

## Current State — What Exists

### Pages & Routing

| Route | Guard | What it does |
|---|---|---|
| `/` | Unauthenticated → Landing; connected → redirect `/markets` | Landing page with headline, connect button, feature highlights |
| `/markets` | Wallet required | Dashboard — all markets (on-chain discovery + local registry merge) |
| `/creator` | Wallet required | Dashboard filtered to markets where `creator === wallet` |
| `/judges` | Wallet required | Dashboard filtered to markets where wallet is a resolver |
| `/create` | Wallet required | Create market form — full 3-step on-chain flow |
| `/platform` | Wallet required | Global config management + collateral allowlist (authority only) |
| `/docs` | Public | Static SDK & integration documentation |
| `/market/:marketKey` | Wallet required | Full market detail: trade, resolve, redeem, admin actions |

### Fully Implemented Flows

- **Wallet connect + network/RPC picker** — in-app switcher with presets (devnet, testnet, mainnet) and custom RPC input, persisted to `localStorage`.
- **Platform admin** (`/platform`) — initialize global config, update fees/authority/treasury, add/remove allowed collateral mints, treasury ATA lookup.
- **Create market** (`/create`) — collateral mint, 2–8 named outcomes, extra resolvers, M-of-N resolution threshold, close-in-N-days, creator fee bps. Runs 3 on-chain transactions and registers the market label locally.
- **Market discovery** (`/markets`) — `program.account.market.all()` scan merged with localStorage registry for human-readable labels.
- **Creator + judge tabs** — filter by wallet pubkey or resolver PDA slot.
- **Market detail** (`/market/:marketKey`) — loads market account, shows open/closed/resolved/voided status, and surfaces all user-facing actions (see below).
- **Trading** — mint complete set (collateral → all outcome tokens), redeem complete set (return all outcome tokens → collateral). See [Trading model & UX roadmap](#trading-model--ux-roadmap) for why there is no single-outcome mint on-chain and what follow-ups are documented.
- **Resolution** — vote for an outcome, finalize resolution (anyone, once threshold reached), redeem winning tokens for collateral after resolution.
- **Lifecycle** — close market early (creator), void market.
- **Docs page** — program overview, SDK setup commands, PDA reference, `PredictionMarketClient` usage examples, program ID.

### Components

| Component | Status |
|---|---|
| `Layout` | Used — header, nav, network dropdown, wallet button, outlet |
| `WalletContext` | Used — wallet adapter + modal setup |
| `MarketCard` | **Exists but unused** — designed as a rich card with outcome chips and status badge; the dashboard uses plain `<Link>` divs instead |

### Library Utilities

| File | Contents |
|---|---|
| `src/lib/marketActions.ts` | All Anchor `Program` calls: create market flow, mint/redeem set, vote/finalize/revoke, close/void, redeem winning, `findResolverSlot` |
| `src/lib/pda.ts` | PDA derivation helpers (mirrors SDK) |
| `src/lib/marketRegistry.ts` | `localStorage` label registry keyed by `marketId` |
| `src/lib/marketDiscovery.ts` | `program.account.market.all()` + registry merge |
| `src/lib/token.ts` | Token-2022 vs legacy detection, ATA helpers, `ensureAssociatedTokenAccount` |
| `src/lib/program.ts` | `PROGRAM_ID`, `fetchIdl()`, `useProgram` hook — **defined but unused** in pages (pages construct `Program` directly) |

---

## What Needs to Be Implemented

### High Priority — Missing UX for Existing Functionality

1. **Outcome labels in market detail**
   Labels entered at creation are stored in localStorage only. The market detail page shows `"Market {first 8 chars}…"` instead of the market name, and resolution voting shows outcome indices (0, 1, 2…) instead of the named outcomes. The registry lookup needs to be wired into `MarketDetail`.

2. **Revoke resolution vote button**
   `revokeResolutionVote` is implemented in `marketActions.ts` and in the SDK but there is no button or UI anywhere in `MarketDetail`. A resolver who has already voted needs a way to retract.

3. **Live token balance display**
   `getTokenBalanceRaw` exists in `token.ts` but is never called in any page. Users cannot see their outcome token or collateral balances without leaving the app. Each outcome row should show the user's balance.

4. **Replace `useProgram` stub with consistent hook**
   `src/lib/program.ts` exports `useProgram` but every page constructs its own `Program` via `fetchIdl`. Either adopt the hook everywhere or remove it.

5. **Wire in the existing `MarketCard` component**
   The `MarketCard` component (with outcome chips, status badge, creator, resolver count) is complete but the dashboard ignores it, rendering plain `<Link>` divs instead.

### Medium Priority — Improved Information Architecture

6. **Market status & timeline**
   No visual indication of whether a market is open, close-window reached, or fully resolved on the list view. Status chips, countdowns, or progress indicators are absent.

7. **Resolution progress bar**
   The `OutcomeTally` on-chain account tracks votes per outcome and total votes. A visual bar showing votes/threshold on the detail page would make resolution legible.

8. **Outcome token supply display**
   Total circulating supply per outcome token could help traders gauge market sentiment before prices are available.

9. **Collateral vault balance**
   `fetchVaultBalance` is in the SDK but not surfaced in the UI.

10. **Paginated / filterable market list**
    `market.all()` returns every market. As markets grow, the list needs pagination, search, and filter (by status, creator, collateral mint).

### Lower Priority — Polish & Dev Experience

11. **README update**
    The current README says "markets list populated when indexer or on-chain fetch is added" — on-chain discovery is already implemented. This copy is stale.

12. **Environment variable for VITE_RPC_ENDPOINT overrides the UI switcher silently**
    When `VITE_RPC_ENDPOINT` is set, the in-app network dropdown shows a selected network that is not actually used. This is confusing. The UI should show a warning or disable the switcher.

13. **Error messages**
    Most try/catch blocks surface raw Anchor errors. User-facing toast or inline error messages with plain-language descriptions would significantly improve UX.

14. **Loading states**
    Several pages have no loading skeleton; blank white flashes while fetching on-chain data.

15. **Empty state for each tab**
    `/creator`, `/judges` show an empty list with no prompt when the wallet hasn't created or been assigned to any market.

---

## Page-by-Page Breakdown

### Landing (`/`)

What exists: headline, value prop copy, `WalletMultiButton`, four feature tiles (Platform / Create / Trade / Resolve).

What's missing:
- Once the program is deployed and live, a "total markets" or "TVL" stat would make the landing feel alive.
- The feature tiles are static; hovering/animating them could improve feel.

---

### Markets Dashboard (`/markets`, `/creator`, `/judges`)

What exists: tab strip linking the three views, `market.all()` discovery, localStorage label merge, plain `<Link>` cards per market.

What's missing:
- Market status chips (Open / Closed / Resolved / Voided)
- The existing `MarketCard` component (unused)
- Resolution progress or countdown on each card
- Search/filter/sort controls
- Pagination
- Empty states with CTAs

---

### Create Market (`/create`)

What exists: full form — collateral mint, outcome count (2–8), outcome name inputs, extra resolvers, M-of-N threshold, close-in-days, creator fee bps. Three-step on-chain flow with basic status messages.

What's missing:
- Step progress indicator (step 1 of 3 / 2 of 3 / 3 of 3)
- Collateral mint validation (check if it's on the allowlist before submitting)
- Summary confirmation screen before sending transactions
- Better error recovery (if step 2 fails the market PDA is already created)

---

### Market Detail (`/market/:marketKey`)

What exists: loads market account, status display, optional manual `marketId` input, trade section (mint/redeem complete set), resolution section (vote + finalize), creator/resolver actions (close early, void), redeem winning section.

What's missing:
- Outcome names (only indices shown)
- User's outcome token balances per row
- Resolution tally / vote progress bar
- Revoke resolution vote button
- Vault balance
- Timeline: close date countdown, resolution window
- Token-2022 collateral handling on redeem paths

---

### Platform (`/platform`)

What exists: load/update `globalConfig`, initialize config, add/remove allowed collateral mints, treasury ATA lookup.

What's missing:
- Read-only view for non-authority wallets (currently shows empty / errors for non-authority)
- Collateral mint list presented as a table with mint metadata (name, symbol) if available

---

### Docs (`/docs`)

What exists: program overview, web app notes, SDK install commands, `PredictionMarketClient` usage snippet, PDA reference table, program ID.

What's missing:
- Reference to `docs/UI-IMPLEMENTATION.md` which the page cites but may not exist
- Code examples for all SDK methods (only `createMarketFull` is shown)

---

## Data & State Management

All on-chain state is fetched on mount with `useEffect`. There is no caching layer, subscription, or optimistic update. Each page independently constructs an Anchor `Program` from the fetched IDL.

Key data flows:

```
wallet + connection
  └─> fetchIdl('/idl/prediction_market.json')
        └─> new Program(idl, programId, { connection })
              ├─> program.account.market.all()       [Discovery]
              ├─> program.account.market.fetch(key)  [Detail]
              ├─> program.account.globalConfig.fetch [Platform]
              └─> program.methods.*()               [Mutations]
```

Market labels: `localStorage` only — not portable across browsers/devices.

---

## On-Chain Capabilities (Program + SDK)

Program ID: `C5QvWnGHeC6o7N68heWFKPvC35eggZ9Mrgqzj86WwrBv`

| Instruction | SDK method | UI |
|---|---|---|
| `initialize_config` | `initializeConfig` | Platform page |
| `update_config` | `updateConfig` | Platform page |
| `add_allowed_collateral_mint` | `addAllowedCollateralMint` | Platform page |
| `remove_allowed_collateral_mint` | `removeAllowedCollateralMint` | Platform page |
| `create_market` | `createMarket` | Create page (step 1) |
| `initialize_market_resolvers` | `initializeMarketResolvers` | Create page (step 2) |
| `initialize_market_mints` | `initializeMarketMints` | Create page (step 3) |
| `mint_complete_set` | `mintCompleteSet` | Market detail — Trade |
| `redeem_complete_set` | `redeemCompleteSet` | Market detail — Trade |
| `vote_resolution` | `voteResolution` | Market detail — Resolution |
| `revoke_resolution_vote` | `revokeResolutionVote` | **No UI button** |
| `finalize_resolution` | `finalizeResolution` | Market detail — Resolution |
| `redeem_winning` | `redeemWinning` | Market detail — Redeem |
| `close_market_early` | `closeMarketEarly` | Market detail — Creator |
| `void_market` | `voidMarket` | Market detail — Creator |

---

## Trading model & UX roadmap

The program uses **conditional tokens with complete sets**: depositing collateral mints **all** outcome tokens at once; there is no instruction for “mint only one outcome.” That matches **product goal 1 (explain-only)** in the repo: the market detail **Participate** section explains the model, and resolver/admin actions are collapsed.

**Future options** (mint + swap for a “pick one” *feel*, or a full on-chain AMM) are scoped in:

[`../docs/market-mechanics-and-ux-options.md`](../docs/market-mechanics-and-ux-options.md)

That document records the **goal decision**, the **design rationale**, and **follow-up implementation** notes for Goals 2 (guided swap) and 3 (protocol AMM).

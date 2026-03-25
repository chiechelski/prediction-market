# Build notes

## Why `__client_accounts_*` re-exports are required (E0432 fix)

With a **multi-file layout** (instruction modules at crate root, e.g. `src/add_allowed_collateral_mint.rs`), `cargo build` can fail with:

```text
error[E0432]: unresolved import `crate`
  --> programs/prediction_market/src/lib.rs:21:1
   | #[program]
```

**Root cause:** Anchor’s `#[program]` codegen (in `anchor-syn`, `codegen/program/accounts.rs`) generates a crate-root `accounts` module that does:

```rust
pub use crate::__client_accounts_<ix_snake>::*;
```

for each instruction. So it expects **`crate::__client_accounts_<ix>`** to exist at **crate root**.  
The `__client_accounts_*` modules are actually created by **`#[derive(Accounts)]`** in each instruction module (e.g. `add_allowed_collateral_mint::__client_accounts_add_allowed_collateral_mint`). So with instructions in separate modules, those generated modules are **not** at crate root and the codegen’s path fails.

**Fix (used in this repo):** In `lib.rs`, define at crate root one re-export module per instruction, named exactly as the codegen expects, and re-export the contents of the derive-generated module:

```rust
pub mod __client_accounts_add_allowed_collateral_mint {
    pub use crate::add_allowed_collateral_mint::__client_accounts_add_allowed_collateral_mint::*;
}
// ... same for create_market, initialize_config, remove_allowed_collateral_mint, update_config
```

Use **`crate::<instruction_mod>::__client_accounts_...`** so the path resolves from the new submodule.  
This matches the workaround described in [Anchor #3690](https://github.com/solana-foundation/anchor/issues/3690) / [#3811](https://github.com/solana-foundation/anchor/issues/3811).

**If you add a new instruction:** add a new `pub mod __client_accounts_<snake_case_ix_name> { ... }` in `lib.rs` that re-exports `crate::<your_instruction_mod>::__client_accounts_<snake_case_ix_name>::*`.

## Current layout

- **Instruction modules at crate root:** `src/add_allowed_collateral_mint.rs`, `src/create_market.rs`, `src/initialize_config.rs`, `src/remove_allowed_collateral_mint.rs`, `src/update_config.rs`.
- **Shared:** `mod errors`, `state`, `utils` in `src/`.
- **Program:** `#[program] pub mod prediction_market { ... }` in `lib.rs` with handlers calling `<module>::handler(...)`.

## create_market

- **Outcome mints:** Fixed 8 (seeds `[market, b"outcome-mint", 0..7]`). Only the first `outcome_count` are logically used; all 8 are created at market creation.
- **Resolvers:** Fixed 8 slots (seeds `[market, b"resolver", 0..7]`). `resolver_pubkeys[0..num_resolvers]` are stored in the first `num_resolvers` resolver accounts.
- **Args:** `CreateMarketArgs` includes `resolver_pubkeys: [Pubkey; 8]` and `num_resolvers: u8`.

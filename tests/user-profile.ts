/**
 * Integration tests for the user-profile instructions:
 *   upsert_user_profile  — create / update a profile (preserves verified flag)
 *   close_user_profile   — reclaim rent by closing the PDA
 *   verify_user_profile  — platform authority sets / revokes the verified flag
 *
 * These tests run on the same local validator as the happy-path suite and
 * depend on the global config having been initialised by prediction_market.ts
 * (authority = payer, treasury = userKeypair).
 *
 * Error codes:
 *   6000 ConfigUnauthorized
 *   6022 DisplayNameTooLong
 *   6023 UrlTooLong
 */

import * as anchor from '@coral-xyz/anchor';
import { BN, Program } from '@coral-xyz/anchor';
import { PredictionMarket } from '../target/types/prediction_market';
import { SystemProgram } from '@solana/web3.js';
import { assert } from 'chai';
import {
  resolverKeypair,
  userKeypair,
  deriveGlobalConfig,
  deriveUserProfile,
} from './test-helpers';

// ─── Shared provider setup ───────────────────────────────────────────────────

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>;
const payer = provider.wallet as anchor.Wallet;
const connection = provider.connection;

const globalConfigPda = deriveGlobalConfig(program.programId);

// ─── Error assertion helper ───────────────────────────────────────────────────

async function assertErrorCode(fn: () => Promise<unknown>, code: number, label: string) {
  try {
    await fn();
    assert.fail(`Expected error code ${code} (${label}) but the instruction succeeded`);
  } catch (err: any) {
    if (err?.message?.startsWith('Expected error code')) throw err;
    const msg = (err?.message ?? err?.toString() ?? '') as string;
    const anchorCode: number | undefined = err?.error?.errorCode?.number ?? err?.code;
    const hasCode =
      anchorCode === code ||
      msg.includes(`"Custom":${code}`) ||
      msg.includes(`Custom":${code}`) ||
      msg.includes(`0x${code.toString(16)}`) ||
      msg.includes(String(code));
    assert.isTrue(hasCode, `Expected error ${code} (${label}), got: ${msg}`);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('user-profile: upsert', () => {
  const payerProfilePda = deriveUserProfile(program.programId, payer.publicKey);
  const userProfilePda  = deriveUserProfile(program.programId, userKeypair.publicKey);

  it('creates a profile for payer on first call', async () => {
    await program.methods
      .upsertUserProfile('Alice', 'https://alice.example.com')
      .accounts({
        userProfile: payerProfilePda,
        wallet: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const profile = await program.account.userProfile.fetch(payerProfilePda);
    assert.equal(profile.displayName, 'Alice');
    assert.equal(profile.url, 'https://alice.example.com');
    assert.isFalse(profile.verified, 'newly created profile must not be verified');
  });

  it('updates an existing profile without touching the verified flag', async () => {
    // The profile was NOT yet verified at this point — confirmed in next describe block.
    await program.methods
      .upsertUserProfile('Alice Updated', 'https://new.example.com')
      .accounts({
        userProfile: payerProfilePda,
        wallet: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const profile = await program.account.userProfile.fetch(payerProfilePda);
    assert.equal(profile.displayName, 'Alice Updated');
    assert.equal(profile.url, 'https://new.example.com');
  });

  it('creates a profile for userKeypair (separate wallet)', async () => {
    await program.methods
      .upsertUserProfile('Bob', 'https://bob.example.com')
      .accounts({
        userProfile: userProfilePda,
        wallet: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc({ skipPreflight: true });

    const profile = await program.account.userProfile.fetch(userProfilePda);
    assert.equal(profile.displayName, 'Bob');
    assert.isFalse(profile.verified);
  });

  it('rejects a display name exceeding 50 bytes', async () => {
    await assertErrorCode(
      () =>
        program.methods
          .upsertUserProfile('a'.repeat(51), '')
          .accounts({
            userProfile: payerProfilePda,
            wallet: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ skipPreflight: true }),
      6022,
      'DisplayNameTooLong',
    );
  });

  it('rejects a URL exceeding 100 bytes', async () => {
    await assertErrorCode(
      () =>
        program.methods
          .upsertUserProfile('Alice', 'x'.repeat(101))
          .accounts({
            userProfile: payerProfilePda,
            wallet: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ skipPreflight: true }),
      6023,
      'UrlTooLong',
    );
  });
});

describe('user-profile: verify', () => {
  const payerProfilePda = deriveUserProfile(program.programId, payer.publicKey);
  const userProfilePda  = deriveUserProfile(program.programId, userKeypair.publicKey);

  it('platform authority can verify a profile', async () => {
    await program.methods
      .verifyUserProfile(true)
      .accounts({
        userProfile: payerProfilePda,
        targetWallet: payer.publicKey,
        authority: payer.publicKey,
        globalConfig: globalConfigPda,
      })
      .rpc({ skipPreflight: true });

    const profile = await program.account.userProfile.fetch(payerProfilePda);
    assert.isTrue(profile.verified);
  });

  it('upsert after verification preserves the verified flag', async () => {
    await program.methods
      .upsertUserProfile('Alice Final', 'https://alice-final.example.com')
      .accounts({
        userProfile: payerProfilePda,
        wallet: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const profile = await program.account.userProfile.fetch(payerProfilePda);
    assert.equal(profile.displayName, 'Alice Final');
    assert.isTrue(profile.verified, 'verified flag must survive an upsert');
  });

  it('platform authority can revoke verification', async () => {
    await program.methods
      .verifyUserProfile(false)
      .accounts({
        userProfile: payerProfilePda,
        targetWallet: payer.publicKey,
        authority: payer.publicKey,
        globalConfig: globalConfigPda,
      })
      .rpc({ skipPreflight: true });

    const profile = await program.account.userProfile.fetch(payerProfilePda);
    assert.isFalse(profile.verified);
  });

  it('non-authority cannot verify a profile', async () => {
    // resolverKeypair is not the platform authority
    await assertErrorCode(
      () =>
        program.methods
          .verifyUserProfile(true)
          .accounts({
            userProfile: userProfilePda,
            targetWallet: userKeypair.publicKey,
            authority: resolverKeypair.publicKey,
            globalConfig: globalConfigPda,
          })
          .signers([resolverKeypair])
          .rpc({ skipPreflight: true }),
      6000,
      'ConfigUnauthorized',
    );
  });
});

describe('user-profile: close', () => {
  const payerProfilePda = deriveUserProfile(program.programId, payer.publicKey);
  const userProfilePda  = deriveUserProfile(program.programId, userKeypair.publicKey);

  it('wallet owner can close their profile and reclaim rent', async () => {
    const balanceBefore = await connection.getBalance(payer.publicKey);

    await program.methods
      .closeUserProfile()
      .accounts({
        userProfile: payerProfilePda,
        wallet: payer.publicKey,
      })
      .rpc({ skipPreflight: true });

    const info = await connection.getAccountInfo(payerProfilePda);
    assert.isNull(info, 'profile account should no longer exist');

    const balanceAfter = await connection.getBalance(payer.publicKey);
    assert.isAbove(balanceAfter, balanceBefore, 'payer should have received rent lamports back');
  });

  it('profile can be re-created after closing', async () => {
    await program.methods
      .upsertUserProfile('Alice Reborn', '')
      .accounts({
        userProfile: payerProfilePda,
        wallet: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    const profile = await program.account.userProfile.fetch(payerProfilePda);
    assert.equal(profile.displayName, 'Alice Reborn');
    assert.isFalse(profile.verified, 'newly re-created profile must not be verified');
  });

  it('userKeypair can close their own profile', async () => {
    await program.methods
      .closeUserProfile()
      .accounts({
        userProfile: userProfilePda,
        wallet: userKeypair.publicKey,
      })
      .signers([userKeypair])
      .rpc({ skipPreflight: true });

    const info = await connection.getAccountInfo(userProfilePda);
    assert.isNull(info);
  });
});

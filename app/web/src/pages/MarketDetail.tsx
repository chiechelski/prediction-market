import { useParams, Link } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchCollateralTokenDisplay,
  formatCollateralUnitLabel,
  type CollateralTokenDisplay,
} from '@/lib/collateralTokenInfo';
import TokenBadge from '@/components/TokenBadge';
import MarketSectorBanner from '@/components/MarketSectorBanner';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { fetchIdl } from '@/lib/program';
import { getRegisteredMarket } from '@/lib/marketRegistry';
import {
  mintCompleteSetTx,
  redeemCompleteSetTx,
  voteResolutionTx,
  revokeResolutionVoteTx,
  finalizeResolutionTx,
  closeMarketEarlyTx,
  voidMarketTx,
  redeemWinningTx,
  findResolverSlot,
  fetchResolutionVoteState,
  fetchOutcomeTallyCounts,
  isParimutuelMarket,
  parimutuelStakeTx,
  parimutuelWithdrawTx,
  parimutuelClaimTx,
  fetchUserProfileReadOnly,
  type UserProfileData,
} from '@/lib/marketActions';
import { resolveCreatorDisplayName } from '@/lib/creatorIdentity';
import { useToast } from '@/context/ToastContext';
import { deriveGlobalConfig, deriveParimutuelPosition, deriveParimutuelState } from '@/lib/pda';
import { formatBpsAsPercent } from '@/lib/bps';
import {
  formatRawCollateralAmount,
  parimutuelUserRefundPreview,
} from '@/lib/parimutuelWithdrawPreview';
import { previewParimutuelStakeDeposit } from '@/lib/depositFeePreview';
import { bnFromAnchor } from '@/lib/anchorAmount';
import {
  formatTimeLeft,
  inferMarketSectorSlug,
} from '@/lib/marketDiscovery';

/** Share of `pool` in `total` for display (e.g. "42.5%"). */
function formatPoolShareOfTotal(pool: BN, total: BN): string {
  if (total.isZero()) return '—';
  const hundredths = pool.mul(new BN(10000)).div(total).toNumber() / 100;
  if (Number.isInteger(hundredths)) return `${hundredths}%`;
  return `${hundredths.toFixed(2).replace(/\.?0+$/, '')}%`;
}

function poolSharePercent(pool: BN, total: BN): number {
  if (total.isZero()) return 0;
  return Math.min(100, pool.mul(new BN(10000)).div(total).toNumber() / 100);
}

/** Stake as % of outcome pool (0–100) for stacked bar segments. */
function stakeShareOfOutcomePool(stake: BN, outcomePool: BN): number {
  if (outcomePool.isZero() || stake.isZero()) return 0;
  return Math.min(100, stake.mul(new BN(10000)).div(outcomePool).toNumber() / 100);
}

const PARI_OUTCOME_ACCENTS = [
  { stake: 'text-secondary', bright: 'bg-secondary', muted: 'bg-secondary/35' },
  { stake: 'text-primary', bright: 'bg-primary', muted: 'bg-primary/35' },
  { stake: 'text-tertiary', bright: 'bg-tertiary', muted: 'bg-tertiary/40' },
] as const;

/** Slash-separated labels from create flow, e.g. "Yes / No / Draw". */
function outcomeLabelsFromRegistry(
  label: string | undefined,
  outcomeCount: number
): string[] {
  const parts = label
    ?.split(' / ')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
  if (parts.length === outcomeCount && outcomeCount > 0) return parts;
  return Array.from({ length: outcomeCount }, (_, i) => `Outcome ${i + 1}`);
}

/** Anchor `Option<u8>` may decode as `number`, `BN`, or null. */
function normalizedResolvedOutcomeIndex(market: {
  voided?: boolean;
  resolvedOutcomeIndex?: unknown;
} | null): number | null {
  if (!market || market.voided) return null;
  const r = market.resolvedOutcomeIndex;
  if (r === null || r === undefined) return null;
  if (typeof r === 'number' && Number.isFinite(r)) return Math.floor(r);
  if (typeof r === 'object' && r !== null && 'toNumber' in r) {
    const n = (r as BN).toNumber();
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  const n = Number(r);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

export default function MarketDetail() {
  const { marketKey } = useParams<{ marketKey: string }>();
  const { connection } = useConnection();
  const wallet = useWallet();
  const toast = useToast();
  const [market, setMarket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [manualMarketId, setManualMarketId] = useState('');
  const [mintHuman, setMintHuman] = useState('1');
  const [winHuman, setWinHuman] = useState('');
  const [voteOutcome, setVoteOutcome] = useState(0);
  const [resolverSlot, setResolverSlot] = useState<number | null>(null);
  /** null = not a resolver; undefined = loading; object = on-chain vote PDA */
  const [resolutionVoteState, setResolutionVoteState] = useState<
    { hasVoted: boolean; outcomeIndex: number } | null | undefined
  >(null);
  /** Bumps after any successful tx so read-only chain data (e.g. resolution vote) refetches. */
  const [chainRefreshVersion, setChainRefreshVersion] = useState(0);
  /** Outcome tally counts 0–7; null until loaded. Used to gate finalize (M-of-N). */
  const [outcomeTallyCounts, setOutcomeTallyCounts] = useState<number[] | null>(null);
  /** Primary or secondary `global_config` authority (for close early / void). */
  const [isGlobalConfigAuthority, setIsGlobalConfigAuthority] = useState(false);
  const [resolvedCategoryName, setResolvedCategoryName] = useState<
    string | null
  >(null);
  const [pariState, setPariState] = useState<{
    totalPool?: unknown;
    outcomePools?: unknown[];
  } | null>(null);
  const [pariStakeOutcomeIdx, setPariStakeOutcomeIdx] = useState(0);
  /** Independent from stake: which outcome's position early-withdraw applies to. */
  const [pariWithdrawOutcomeIdx, setPariWithdrawOutcomeIdx] = useState(0);
  const [pariWithdrawHuman, setPariWithdrawHuman] = useState('1');
  /** Refetch pari position + global withdraw fee after txs */
  const [pariWalletDataVersion, setPariWalletDataVersion] = useState(0);
  /** Per-outcome active stake for the connected wallet; null if N/A or not loaded. */
  const [pariStakesByOutcome, setPariStakesByOutcome] = useState<BN[] | null>(null);
  const [pariLastClaimedAmount, setPariLastClaimedAmount] = useState<BN | null>(null);
  const [pariWithdrawPlatformFeeBps, setPariWithdrawPlatformFeeBps] = useState(0);
  const [pariPlatformFeeLamports, setPariPlatformFeeLamports] = useState(0);
  /** Global default deposit platform fee (bps); used with per-market override. */
  const [pariGlobalDepositFeeBps, setPariGlobalDepositFeeBps] = useState(0);
  const [pariPoolAndFeesReady, setPariPoolAndFeesReady] = useState(false);
  const [collateralDisplay, setCollateralDisplay] =
    useState<CollateralTokenDisplay | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<
    UserProfileData | null | undefined
  >(undefined);

  const registry = marketKey ? getRegisteredMarket(marketKey) : undefined;
  const effectiveMarketId =
    registry?.marketId ?? (manualMarketId.trim() || null);

  const loadMarket = useCallback(async () => {
    if (!marketKey) return;
    setLoading(true);
    setError(null);
    try {
      const idl = await fetchIdl();
      const dummy = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: async (t: any) => t,
        signAllTransactions: async (ts: any) => ts,
      };
      const provider = new AnchorProvider(connection, dummy as any, {
        commitment: 'confirmed',
      });
      const program = new Program(idl, provider);
      const account = await (program.account as any).market.fetch(
        new PublicKey(marketKey)
      );
      setMarket(account);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load market');
      setMarket(null);
    } finally {
      setLoading(false);
    }
  }, [connection, marketKey]);

  useEffect(() => {
    loadMarket();
  }, [loadMarket]);

  useEffect(() => {
    if (!market?.creator) {
      setCreatorProfile(undefined);
      return;
    }
    const creatorWallet = market.creator as PublicKey;
    let cancelled = false;
    setCreatorProfile(undefined);
    fetchUserProfileReadOnly(connection, creatorWallet)
      .then((p) => {
        if (!cancelled) setCreatorProfile(p);
      })
      .catch(() => {
        if (!cancelled) setCreatorProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, market?.creator]);

  useEffect(() => {
    if (!market?.category) {
      setResolvedCategoryName(null);
      return;
    }
    const catPk = market.category as PublicKey;
    if (catPk.equals(PublicKey.default)) {
      setResolvedCategoryName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const idl = await fetchIdl();
        const dummy = {
          publicKey: new PublicKey('11111111111111111111111111111111'),
          signTransaction: async (t: unknown) => t,
          signAllTransactions: async (ts: unknown) => ts,
        };
        const provider = new AnchorProvider(connection, dummy as any, {
          commitment: 'confirmed',
        });
        const program = new Program(idl, provider);
        const acc = await (program.account as any).marketCategory.fetch(catPk);
        if (!cancelled) setResolvedCategoryName(String(acc.name ?? ''));
      } catch {
        if (!cancelled) setResolvedCategoryName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, market]);

  useEffect(() => {
    if (!marketKey || !wallet.publicKey || !market) {
      setResolverSlot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const slot = await findResolverSlot(
        connection,
        wallet,
        new PublicKey(marketKey)
      );
      if (!cancelled) setResolverSlot(slot);
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, marketKey, wallet.publicKey, wallet, market]);

  useEffect(() => {
    if (!marketKey || resolverSlot === null) {
      setResolutionVoteState(null);
      return;
    }
    let cancelled = false;
    setResolutionVoteState(undefined);
    (async () => {
      try {
        const s = await fetchResolutionVoteState(
          connection,
          new PublicKey(marketKey),
          resolverSlot
        );
        if (!cancelled) setResolutionVoteState(s);
      } catch {
        if (!cancelled)
          setResolutionVoteState({ hasVoted: false, outcomeIndex: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, marketKey, resolverSlot, chainRefreshVersion]);

  useEffect(() => {
    if (!wallet.publicKey) {
      setIsGlobalConfigAuthority(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const idl = await fetchIdl();
        const dummy = {
          publicKey: new PublicKey('11111111111111111111111111111111'),
          signTransaction: async (t: unknown) => t,
          signAllTransactions: async (ts: unknown) => ts,
        };
        const provider = new AnchorProvider(connection, dummy as any, {
          commitment: 'confirmed',
        });
        const program = new Program(idl, provider);
        const gcPda = deriveGlobalConfig(program.programId);
        const info = await connection.getAccountInfo(gcPda);
        if (!info || cancelled) {
          if (!cancelled) setIsGlobalConfigAuthority(false);
          return;
        }
        const gc = await (program.account as any).globalConfig.fetch(gcPda);
        if (cancelled) return;
        const auth = gc.authority as PublicKey;
        const sec = gc.secondaryAuthority as PublicKey;
        const pk = wallet.publicKey!;
        const defaultPk = new PublicKey('11111111111111111111111111111111');
        const isPrimary = auth.equals(pk);
        const isSecondary = !sec.equals(defaultPk) && sec.equals(pk);
        setIsGlobalConfigAuthority(isPrimary || isSecondary);
      } catch {
        if (!cancelled) setIsGlobalConfigAuthority(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, wallet.publicKey, chainRefreshVersion]);

  useEffect(() => {
    if (!marketKey || !market) {
      setOutcomeTallyCounts(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const counts = await fetchOutcomeTallyCounts(
          connection,
          new PublicKey(marketKey)
        );
        if (!cancelled) setOutcomeTallyCounts(counts);
      } catch {
        if (!cancelled) setOutcomeTallyCounts(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, marketKey, market, chainRefreshVersion]);

  useEffect(() => {
    if (resolutionVoteState?.hasVoted) {
      setVoteOutcome(resolutionVoteState.outcomeIndex);
    }
  }, [resolutionVoteState]);

  useEffect(() => {
    const raw = market?.collateralMint;
    if (raw == null) {
      setCollateralDisplay(null);
      return;
    }
    const mintPk = new PublicKey(raw as PublicKey | string);
    let cancelled = false;
    fetchCollateralTokenDisplay(connection, mintPk).then((d) => {
      if (!cancelled) setCollateralDisplay(d);
    });
    return () => {
      cancelled = true;
    };
  }, [connection, market?.collateralMint]);

  /** Pool + global fee schedule (no wallet required). */
  useEffect(() => {
    if (!marketKey || !market || !isParimutuelMarket(market)) {
      setPariState(null);
      setPariWithdrawPlatformFeeBps(0);
      setPariPlatformFeeLamports(0);
      setPariGlobalDepositFeeBps(0);
      setPariPoolAndFeesReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const idl = await fetchIdl();
        const dummy = {
          publicKey: new PublicKey('11111111111111111111111111111111'),
          signTransaction: async (t: unknown) => t,
          signAllTransactions: async (ts: unknown) => ts,
        };
        const provider = new AnchorProvider(connection, dummy as any, {
          commitment: 'confirmed',
        });
        const program = new Program(idl, provider);
        const marketPk = new PublicKey(marketKey);
        const gcPda = deriveGlobalConfig(program.programId);
        const pariPda = deriveParimutuelState(program.programId, marketPk);
        const [gc, pariAcc] = await Promise.all([
          (program.account as any).globalConfig.fetch(gcPda),
          (program.account as any).parimutuelState.fetch(pariPda),
        ]);
        if (!cancelled) {
          setPariState(pariAcc);
          setPariGlobalDepositFeeBps(Number(gc.depositPlatformFeeBps ?? 0));
          setPariWithdrawPlatformFeeBps(
            Number(gc.parimutuelWithdrawPlatformFeeBps ?? 0)
          );
          setPariPlatformFeeLamports(gc.platformFeeLamports?.toNumber?.() ?? 0);
          setPariPoolAndFeesReady(true);
        }
      } catch {
        if (!cancelled) {
          setPariState(null);
          setPariPoolAndFeesReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, marketKey, market, pariWalletDataVersion]);

  /** Your position on every outcome (wallet), for pool breakdown + early exit. */
  useEffect(() => {
    if (!marketKey || !wallet.publicKey || !market || !isParimutuelMarket(market)) {
      setPariStakesByOutcome(null);
      return;
    }
    const n = Number(market.outcomeCount);
    if (!Number.isFinite(n) || n < 1) {
      setPariStakesByOutcome(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const idl = await fetchIdl();
        const dummy = {
          publicKey: new PublicKey('11111111111111111111111111111111'),
          signTransaction: async (t: unknown) => t,
          signAllTransactions: async (ts: unknown) => ts,
        };
        const provider = new AnchorProvider(connection, dummy as any, {
          commitment: 'confirmed',
        });
        const program = new Program(idl, provider);
        const marketPk = new PublicKey(marketKey);
        const stakes = await Promise.all(
          Array.from({ length: n }, async (_, outcomeIdx) => {
            const posPda = deriveParimutuelPosition(
              program.programId,
              marketPk,
              wallet.publicKey!,
              outcomeIdx
            );
            try {
              const pos = await (program.account as any).parimutuelPosition.fetch(posPda);
              return new BN((pos.activeStake as BN).toString());
            } catch {
              return new BN(0);
            }
          })
        );
        if (!cancelled) setPariStakesByOutcome(stakes);
      } catch {
        if (!cancelled) setPariStakesByOutcome(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, marketKey, wallet.publicKey, market, pariWalletDataVersion]);

  const pariPositionStake = useMemo(() => {
    if (
      !pariStakesByOutcome ||
      pariWithdrawOutcomeIdx < 0 ||
      pariWithdrawOutcomeIdx >= pariStakesByOutcome.length
    ) {
      return null;
    }
    return pariStakesByOutcome[pariWithdrawOutcomeIdx]!;
  }, [pariStakesByOutcome, pariWithdrawOutcomeIdx]);

  const pariTotalPoolBn = useMemo(() => {
    if (!pariState || !market) return null;
    return bnFromAnchor((pariState as { totalPool?: unknown }).totalPool);
  }, [pariState, market]);

  /** Only show pari claim CTA when positions are loaded and winning outcome has active stake. */
  const hasPariWinningStakeToClaim = useMemo(() => {
    if (!market || !isParimutuelMarket(market) || market.voided) return false;
    const winIdx = normalizedResolvedOutcomeIndex(market);
    if (winIdx === null) return false;
    if (
      !pariStakesByOutcome ||
      winIdx < 0 ||
      winIdx >= pariStakesByOutcome.length
    ) {
      return false;
    }
    return pariStakesByOutcome[winIdx]!.gtn(0);
  }, [market, pariStakesByOutcome]);

  /** Pro-rata payout estimate: userStake / winningPool × totalPool */
  const pariClaimPreview = useMemo((): BN | null => {
    if (!market || !isParimutuelMarket(market) || !pariState) return null;
    const winIdx = normalizedResolvedOutcomeIndex(market);
    if (winIdx === null) return null;
    const userStake = pariStakesByOutcome?.[winIdx];
    if (!userStake || userStake.lten(0)) return null;
    const totalPool = bnFromAnchor((pariState as { totalPool?: unknown }).totalPool);
    const winPool = bnFromAnchor(
      (pariState as { outcomePools?: unknown[] }).outcomePools?.[winIdx]
    );
    if (winPool.lten(0)) return null;
    // payout = userStake * totalPool / winPool
    return userStake.mul(totalPool).div(winPool);
  }, [market, pariState, pariStakesByOutcome]);

  /** Matches `finalize_resolution`: needs some outcome tally ≥ resolution_threshold. */
  const talliesMeetResolutionThreshold = useMemo(() => {
    if (!market || !outcomeTallyCounts) return false;
    const oc = Number(market.outcomeCount);
    const th = Number(market.resolutionThreshold);
    if (!Number.isFinite(oc) || !Number.isFinite(th) || oc <= 0 || th <= 0) return false;
    return outcomeTallyCounts.slice(0, oc).some((c) => c >= th);
  }, [market, outcomeTallyCounts]);

  const marketIdBn = effectiveMarketId
    ? new BN(effectiveMarketId, 10)
    : null;

  const status: 'voided' | 'resolved' | 'closed' | 'open' | 'closing-soon' | 'unknown' =
    market
      ? market.voided
        ? 'voided'
        : normalizedResolvedOutcomeIndex(market) !== null
          ? 'resolved'
          : market.closed
            ? 'closed'
            : (() => {
                const closeAt = Number(market.closeAt);
                const now = Date.now() / 1000;
                const left = closeAt - now;
                if (left > 0 && left < 86400 * 2) return 'closing-soon';
                return 'open';
              })()
      : 'unknown';

  const collateralMint: PublicKey | null = market
    ? new PublicKey(market.collateralMint as PublicKey | string)
    : null;

  const poolUnitLabel = useMemo(() => {
    if (!market || !collateralMint) return '…';
    return formatCollateralUnitLabel(
      collateralMint,
      collateralDisplay,
      Number(market.collateralDecimals)
    );
  }, [collateralDisplay, market, collateralMint]);

  const pariWithdrawPreview = useMemo(() => {
    if (!market || !isParimutuelMarket(market) || !pariState) return null;
    const dec = Number(market.collateralDecimals);
    const wn = parseFloat(pariWithdrawHuman);
    if (!Number.isFinite(wn) || wn <= 0) return null;
    const raw = new BN(Math.floor(wn * 10 ** dec));
    if (raw.lten(0)) return null;
    if (pariPositionStake !== null && raw.gt(pariPositionStake)) return null;
    const early = Number(
      (pariState as { earlyWithdrawPenaltyBps?: number }).earlyWithdrawPenaltyBps ??
        0
    );
    return parimutuelUserRefundPreview(raw, early, pariWithdrawPlatformFeeBps);
  }, [
    market,
    pariState,
    pariWithdrawHuman,
    pariWithdrawPlatformFeeBps,
    pariPositionStake,
  ]);

  const pariWithdrawExceedsActiveStake = useMemo(() => {
    if (!market || !isParimutuelMarket(market) || pariPositionStake === null) return false;
    const dec = Number(market.collateralDecimals);
    const wn = parseFloat(pariWithdrawHuman);
    if (!Number.isFinite(wn) || wn <= 0) return false;
    const raw = new BN(Math.floor(wn * 10 ** dec));
    return raw.gt(pariPositionStake);
  }, [market, pariWithdrawHuman, pariPositionStake]);

  /** User enters amount they want credited to the pool; preview finds gross charged. */
  const pariStakeFeePreview = useMemo(() => {
    if (!market || !isParimutuelMarket(market) || !pariPoolAndFeesReady) return null;
    const dec = Number(market.collateralDecimals);
    const n = parseFloat(mintHuman);
    if (!Number.isFinite(n) || n <= 0) return null;
    const desiredNet = new BN(Math.floor(n * 10 ** dec));
    if (desiredNet.lten(0)) return null;
    return previewParimutuelStakeDeposit(
      desiredNet,
      Number(market.depositPlatformFeeBps ?? 0),
      pariGlobalDepositFeeBps,
      Number(market.creatorFeeBps ?? 0)
    );
  }, [market, mintHuman, pariGlobalDepositFeeBps, pariPoolAndFeesReady]);

  const run = async (fn: () => Promise<void>, successMessage: string) => {
    setTxError(null);
    setBusy(true);
    try {
      await fn();
      await loadMarket();
      setChainRefreshVersion((v) => v + 1);
      if (market && isParimutuelMarket(market)) {
        setPariWalletDataVersion((v) => v + 1);
      }
      toast.success(successMessage);
    } catch (e: any) {
      const msg = e?.message ?? 'Transaction failed';
      setTxError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleMint = async () => {
    if (!marketKey || !wallet.publicKey || !marketIdBn || !collateralMint) return;
    const dec = Number(market.collateralDecimals);
    const n = parseFloat(mintHuman);
    if (!Number.isFinite(n) || n <= 0) {
      setTxError('Enter a positive amount');
      return;
    }
    const raw = new BN(Math.floor(n * 10 ** dec));
    await run(
      () =>
        mintCompleteSetTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn,
          collateralMint,
          raw
        ),
      'Complete set minted.'
    );
  };

  const handleRedeemSet = async () => {
    if (!marketKey || !marketIdBn || !collateralMint) return;
    await run(
      () =>
        redeemCompleteSetTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn,
          collateralMint
        ),
      'Complete set redeemed.'
    );
  };

  const handleVote = async () => {
    if (
      !marketKey ||
      !marketIdBn ||
      resolverSlot === null ||
      resolverSlot === undefined
    ) {
      setTxError('Your wallet is not a resolver for this market');
      return;
    }
    if (resolutionVoteState?.hasVoted) {
      setTxError('You already voted. Revoke your vote first to change it.');
      return;
    }
    await run(
      () =>
        voteResolutionTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn,
          voteOutcome,
          resolverSlot
        ),
      'Resolution vote submitted.'
    );
  };

  const handleRevokeVote = async () => {
    if (
      !marketKey ||
      !marketIdBn ||
      resolverSlot === null ||
      !resolutionVoteState?.hasVoted
    ) {
      return;
    }
    await run(
      () =>
        revokeResolutionVoteTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn,
          resolutionVoteState.outcomeIndex,
          resolverSlot
        ),
      'Vote revoked. You can submit a new vote.'
    );
  };

  const handleFinalize = async () => {
    if (!marketKey || !marketIdBn) return;
    if (!talliesMeetResolutionThreshold) {
      setTxError('Not enough matching resolver votes on-chain to finalize yet.');
      return;
    }
    await run(
      () =>
        finalizeResolutionTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn
        ),
      'Resolution finalized.'
    );
  };

  const handleCloseEarly = async () => {
    if (!marketKey || !marketIdBn) return;
    await run(
      () =>
        closeMarketEarlyTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn
        ),
      'Market closed early.'
    );
  };

  const handleVoid = async () => {
    if (!marketKey || !marketIdBn) return;
    await run(
      () => voidMarketTx(connection, wallet, new PublicKey(marketKey), marketIdBn),
      'Market voided.'
    );
  };

  const handlePariStake = async () => {
    if (!marketKey || !wallet.publicKey || !marketIdBn || !collateralMint || !market) return;
    const n = parseFloat(mintHuman);
    if (!Number.isFinite(n) || n <= 0) {
      setTxError('Enter a positive amount');
      return;
    }
    if (!pariStakeFeePreview?.gross) {
      setTxError('Could not compute stake amount (check fee settings)');
      return;
    }
    const dec = Number(market.collateralDecimals);
    const stakeLabels = outcomeLabelsFromRegistry(
      registry?.label,
      Number(market.outcomeCount)
    );
    const optionLabel =
      stakeLabels[pariStakeOutcomeIdx] ?? `Outcome ${pariStakeOutcomeIdx + 1}`;
    const credited = formatRawCollateralAmount(pariStakeFeePreview.netToPool, dec);
    const stakeSuccessMsg = `Staked ${credited} ${poolUnitLabel} on ${optionLabel}.`;

    await run(
      () =>
        parimutuelStakeTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn,
          collateralMint,
          pariStakeOutcomeIdx,
          pariStakeFeePreview.netToPool
        ),
      stakeSuccessMsg
    );
  };

  const handlePariWithdraw = async () => {
    if (!marketKey || !wallet.publicKey || !marketIdBn || !collateralMint || !market) return;
    const dec = Number(market.collateralDecimals);
    const n = parseFloat(pariWithdrawHuman);
    if (!Number.isFinite(n) || n <= 0) {
      setTxError('Enter a positive amount');
      return;
    }
    const raw = new BN(Math.floor(n * 10 ** dec));
    if (pariPositionStake && raw.gt(pariPositionStake)) {
      setTxError('Amount exceeds active stake on this outcome');
      return;
    }
    await run(
      () =>
        parimutuelWithdrawTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn,
          collateralMint,
          pariWithdrawOutcomeIdx,
          raw
        ),
      'Stake withdrawn.'
    );
  };

  const handlePariClaim = async () => {
    if (!marketKey || !wallet.publicKey || !marketIdBn || !collateralMint || !market) return;
    const winIdx = normalizedResolvedOutcomeIndex(market);
    if (winIdx === null) {
      setTxError('Market not resolved');
      return;
    }
    const winStake = pariStakesByOutcome?.[winIdx];
    if (!winStake?.gtn(0)) {
      setTxError('You have no stake on the winning outcome to claim.');
      return;
    }
    if (pariClaimPreview) setPariLastClaimedAmount(pariClaimPreview);
    await run(
      () =>
        parimutuelClaimTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn,
          collateralMint,
          winIdx
        ),
      'Winnings claimed.'
    );
  };

  const handleRedeemWinning = async () => {
    if (!marketKey || !marketIdBn || !collateralMint || !market) return;
    const dec = Number(market.collateralDecimals);
    const n = parseFloat(winHuman);
    if (!Number.isFinite(n) || n <= 0) {
      setTxError('Enter winning amount to redeem');
      return;
    }
    const raw = new BN(Math.floor(n * 10 ** dec));
    const winIdx = normalizedResolvedOutcomeIndex(market);
    if (winIdx === null) {
      setTxError('Market not resolved');
      return;
    }
    await run(
      () =>
        redeemWinningTx(
          connection,
          wallet,
          new PublicKey(marketKey),
          marketIdBn,
          collateralMint,
          raw
        ),
      'Winning tokens redeemed.'
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-outline">Loading market…</p>
      </div>
    );
  }
  if (error || !market) {
    return (
      <div className="card p-8 text-center">
        <p className="text-on-surface-variant">{error ?? 'Market not found.'}</p>
        <Link to="/markets" className="mt-4 inline-block text-brand-600 hover:text-brand-700">
          ← Back to markets
        </Link>
      </div>
    );
  }

  const outcomeCount = Number(market.outcomeCount);
  const chainTitle =
    typeof market.title === 'string' ? market.title.trim() : '';
  const chainCategoryLabel = resolvedCategoryName?.trim() ?? '';
  const displayTitle =
    chainTitle ||
    registry?.title?.trim() ||
    `Market ${marketKey?.slice(0, 8)}…`;
  const displayCategory = chainCategoryLabel || registry?.category;
  const outcomeLabels = outcomeLabelsFromRegistry(registry?.label, outcomeCount);
  const isPari = isParimutuelMarket(market);
  const resolvedWinnerIdx = normalizedResolvedOutcomeIndex(market);
  const winningLabel =
    resolvedWinnerIdx !== null &&
    resolvedWinnerIdx >= 0 &&
    resolvedWinnerIdx < outcomeCount
      ? outcomeLabels[resolvedWinnerIdx]!
      : resolvedWinnerIdx !== null
        ? `Outcome ${resolvedWinnerIdx + 1}`
        : null;
  const showPariTradingSidebar =
    isPari &&
    !market.voided &&
    resolvedWinnerIdx === null &&
    (status === 'open' || status === 'closing-soon');
  /** Matches on-chain `!market.closed`: still tradable while close is in the future (incl. UI “closing soon”). */
  const marketAcceptsCollateral = status === 'open' || status === 'closing-soon';
  const sectorSlug = inferMarketSectorSlug(displayCategory ?? undefined);
  const breadcrumbTitle =
    displayTitle.length > 52 ? `${displayTitle.slice(0, 49)}…` : displayTitle;
  const closeAtSec = Number(market.closeAt);
  const depositPlatformBpsEffective =
    Number(market.depositPlatformFeeBps ?? 0) > 0
      ? Number(market.depositPlatformFeeBps ?? 0)
      : pariGlobalDepositFeeBps;

  const creatorPk = (market.creator as PublicKey).toBase58();
  const isMarketCreator =
    !!wallet.publicKey && (market.creator as PublicKey).equals(wallet.publicKey);
  /** On-chain: `close_market_early` / `void_market` — creator or global config authority only. */
  const canCloseOrVoidMarket = isMarketCreator || isGlobalConfigAuthority;
  const shortAddr = (pk: string) => `${pk.slice(0, 4)}…${pk.slice(-4)}`;
  const creatorLabel = resolveCreatorDisplayName(creatorPk, creatorProfile);
  const creatorNamed = creatorLabel !== shortAddr(creatorPk);

  const shareMarketLink = async () => {
    if (!marketKey) return;
    const url = `${window.location.origin}/market/${marketKey}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: displayTitle, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
    <div className="mx-auto w-full max-w-7xl">
      {isPari ? (
        <nav className="mb-8 flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-outline">
          <Link to="/markets" className="transition-colors hover:text-primary">
            Markets
          </Link>
          <span className="material-symbols-outlined text-[12px]">chevron_right</span>
          {sectorSlug ? (
            <>
              <Link
                to={`/markets?sector=${sectorSlug}`}
                className="transition-colors hover:text-primary"
              >
                {sectorSlug.charAt(0).toUpperCase() + sectorSlug.slice(1)}
              </Link>
              <span className="material-symbols-outlined text-[12px]">chevron_right</span>
            </>
          ) : displayCategory ? (
            <>
              <span className="text-on-surface-variant">{displayCategory}</span>
              <span className="material-symbols-outlined text-[12px]">chevron_right</span>
            </>
          ) : null}
          <span className="text-on-surface">{breadcrumbTitle}</span>
        </nav>
      ) : (
        <Link
          to="/markets"
          className="mb-6 inline-flex items-center gap-1 text-sm text-outline hover:text-on-surface transition-colors"
        >
          ← Markets
        </Link>
      )}
      {isPari && (
        <MarketSectorBanner
          category={displayCategory}
          variant="hero"
          className="mb-6 rounded-2xl border border-outline-variant/10"
        />
      )}
      <div className={isPari ? 'space-y-6' : 'card overflow-hidden p-6 space-y-6'}>
        {!isPari && (
        <>
        <div className="-mx-6 -mt-6 mb-4">
          <MarketSectorBanner category={displayCategory} variant="card" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface italic">
              {displayTitle}
            </h1>
            {displayCategory && (
              <p className="mt-1">
                <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                  {displayCategory}
                </span>
              </p>
            )}
            <p className="mt-1 text-on-surface-variant">
              {outcomeCount} outcomes · M-of-N: {market.resolutionThreshold}
              {isParimutuelMarket(market) && (
                <span className="ml-2 inline-flex rounded-md bg-tertiary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Pari-mutuel
                </span>
              )}
            </p>
            <details className="mt-2 text-xs text-outline">
              <summary className="cursor-pointer select-none text-outline hover:text-on-surface-variant">
                Market token
              </summary>
              <div className="mt-2 space-y-2 pl-1">
                <TokenBadge
                  mint={collateralMint}
                  display={collateralDisplay}
                  decimals={Number(market.collateralDecimals)}
                  variant="chip"
                />
                {collateralDisplay?.name && (
                  <p className="text-on-surface-variant">{collateralDisplay.name}</p>
                )}
                <p className="text-outline">
                  Program: {collateralDisplay?.tokenProgram ?? '…'}
                  {collateralDisplay?.fromRegistry ? ' · static registry' : ''}
                </p>
                <p className="font-mono break-all text-outline">{collateralMint?.toBase58()}</p>
              </div>
            </details>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${
              status === 'open'
                ? 'bg-secondary/10 text-secondary'
                : status === 'resolved'
                  ? 'bg-primary/10 text-primary'
                  : status === 'voided'
                    ? 'bg-error/10 text-error'
                    : status === 'closing-soon'
                      ? 'bg-tertiary/10 text-tertiary'
                      : 'text-outline'
            }`}
          >
            {status}
          </span>
        </div>
        </>
        )}

        {!effectiveMarketId && (
          <div className="rounded-xl border border-tertiary/20 bg-tertiary/10 p-4">
            <p className="text-sm text-tertiary">
              This browser has no stored <code>marketId</code> for this market.
              Enter the u64 market id used at creation (same device saves it
              automatically).
            </p>
            <input
              type="text"
              value={manualMarketId}
              onChange={(e) => setManualMarketId(e.target.value)}
              placeholder="market id (decimal)"
              className="input mt-2 font-mono"
            />
          </div>
        )}

        {winningLabel && !isPari && (
          <div className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3">
            <p className="text-sm text-on-surface">
              <span className="font-bold text-primary">Resolved.</span> Winning outcome:{' '}
              <span className="font-semibold">{winningLabel}</span>
            </p>
          </div>
        )}

        {txError && (
          <div className="flex items-start gap-2 rounded-xl bg-error/10 border border-error/20 p-3">
            <span className="material-symbols-outlined text-error text-[16px] mt-0.5">error</span>
            <p className="text-sm text-error">{txError}</p>
          </div>
        )}

        {!wallet.publicKey && (
          <p className="text-on-surface-variant">Connect a wallet to transact.</p>
        )}

        {wallet.publicKey && marketIdBn && (
          <>
            {!isParimutuelMarket(market) ? (
              <section className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest/80 p-4">
                <h2 className="text-lg font-bold text-on-surface">
                  Participate
                </h2>
                <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                  This market uses <strong className="text-on-surface">one token per outcome</strong>{' '}
                  (e.g. {outcomeLabels.slice(0, 3).join(', ')}
                  {outcomeCount > 3 ? '…' : ''}).{' '}
                  <strong className="text-on-surface">Deposit</strong> {poolUnitLabel} to receive{' '}
                  <em>all</em> of those tokens at once—not a single “pick.” To lean toward one outcome
                  you’d trade tokens elsewhere (this app doesn’t include a swap).
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-on-surface-variant">
                  <li>
                    <strong className="text-on-surface">Deposit</strong> — pay {poolUnitLabel}, get 1 unit of
                    every outcome token (protocol term: “mint complete set”).
                  </li>
                  <li>
                    <strong className="text-on-surface">Withdraw full set</strong> — burn 1 of each
                    outcome token, get your {poolUnitLabel} back (protocol: “redeem complete set”).
                  </li>
                </ul>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-outline">
                      Amount ({poolUnitLabel})
                    </label>
                    <input
                      type="text"
                      value={mintHuman}
                      onChange={(e) => setMintHuman(e.target.value)}
                      className="input w-32"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy || !marketAcceptsCollateral}
                    onClick={handleMint}
                    className="btn-primary disabled:opacity-50"
                  >
                    Deposit &amp; get all outcome tokens
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRedeemSet}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Withdraw (return full set)
                  </button>
                </div>
              </section>
            ) : (
              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-12 space-y-8 lg:col-span-8">
                  <section>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="mb-4 flex flex-wrap items-center gap-3">
                          <span
                            className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              status === 'open'
                                ? 'border-secondary/20 bg-secondary/10 text-secondary'
                                : status === 'resolved'
                                  ? 'border-primary/20 bg-primary/10 text-primary'
                                  : status === 'voided'
                                    ? 'border-error/20 bg-error/10 text-error'
                                    : 'border-outline-variant/20 bg-surface-container-high text-outline'
                            }`}
                          >
                            {status}
                          </span>
                          {Number.isFinite(closeAtSec) && closeAtSec > 0 && (
                            <span className="flex items-center gap-1 text-xs text-outline">
                              <span className="material-symbols-outlined text-[16px]">schedule</span>
                              {status === 'open' || status === 'closing-soon'
                                ? `Closes in ${formatTimeLeft(closeAtSec)}`
                                : 'Closed'}
                            </span>
                          )}
                        </div>
                        <h1 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface md:text-3xl lg:text-4xl">
                          {displayTitle}
                        </h1>
                        {displayCategory && (
                          <p className="mt-2">
                            <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                              {displayCategory}
                            </span>
                            <span className="ml-2 inline-flex rounded-md bg-tertiary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-tertiary">
                              Pari-mutuel
                            </span>
                          </p>
                        )}
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
                          {outcomeCount} outcomes · M-of-N resolution: {market.resolutionThreshold}.
                          Winners split the pool pro-rata after resolvers finalize the outcome.
                        </p>
                        <details className="mt-3 text-xs text-outline">
                          <summary className="cursor-pointer select-none hover:text-on-surface-variant">
                            Market token
                          </summary>
                          <div className="mt-2 space-y-2">
                            <TokenBadge
                              mint={collateralMint}
                              display={collateralDisplay}
                              decimals={Number(market.collateralDecimals)}
                              variant="chip"
                            />
                            {collateralDisplay?.name && (
                              <p className="text-on-surface-variant">{collateralDisplay.name}</p>
                            )}
                            <p className="text-outline">
                              Program: {collateralDisplay?.tokenProgram ?? '…'}
                              {collateralDisplay?.fromRegistry ? ' · static registry' : ''}
                            </p>
                            <p className="font-mono break-all text-outline">{collateralMint?.toBase58()}</p>
                          </div>
                        </details>
                      </div>
                    </div>
                  </section>

                  <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6 md:p-8">
                    <div className="mb-8 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">
                          Total pool liquidity
                        </p>
                        <p className="max-w-[min(100%,14rem)] text-right text-[10px] leading-snug text-outline sm:max-w-[20rem]">
                          {market.resolutionThreshold}-of-{outcomeCount} resolvers · Collateral:{' '}
                          {collateralDisplay?.name ?? poolUnitLabel}
                        </p>
                      </div>
                      <p className="mt-2 font-headline text-2xl font-bold tabular-nums tracking-tight text-on-surface sm:text-3xl">
                        {pariState && market
                          ? `${formatRawCollateralAmount(
                              bnFromAnchor((pariState as { totalPool?: unknown }).totalPool),
                              Number(market.collateralDecimals)
                            )} ${poolUnitLabel}`
                          : pariPoolAndFeesReady
                            ? `0 ${poolUnitLabel}`
                            : '…'}
                      </p>
                    </div>

                    <div className="space-y-8">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                          Outcome weighting
                        </h3>
                        <p className="max-w-md text-right text-[11px] italic leading-snug text-outline sm:max-w-[20rem]">
                          Winners split the entire pool proportional to their stake.
                        </p>
                      </div>
                      {pariState &&
                        market &&
                        pariTotalPoolBn?.isZero() &&
                        (status === 'open' || status === 'closing-soon') ? (
                        <div className="rounded-xl border border-dashed border-outline-variant/25 bg-gradient-to-b from-surface-container/40 to-surface-container-low/20 px-5 py-10 text-center sm:px-8">
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/15 text-secondary ring-1 ring-secondary/20">
                            <span
                              className="material-symbols-outlined text-[32px]"
                              style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
                            >
                              savings
                            </span>
                          </div>
                          <p className="mt-5 font-headline text-lg font-bold tracking-tight text-on-surface sm:text-xl">
                            No liquidity in the pool yet
                          </p>
                          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-on-surface-variant">
                            Outcome bars and percentages appear once someone stakes. Until then the
                            pool stays at zero — add a stake on an outcome to open the market side
                            you believe in.
                          </p>
                          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-outline">
                            Outcomes
                          </p>
                          <div className="mt-3 flex flex-wrap justify-center gap-2">
                            {Array.from({ length: outcomeCount }, (_, i) => (
                              <span
                                key={i}
                                className="rounded-lg border border-outline-variant/20 bg-surface-container-low/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-on-surface"
                              >
                                {outcomeLabels[i]}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {pariState &&
                        market &&
                        pariTotalPoolBn &&
                        (!pariTotalPoolBn.isZero() ||
                          (status !== 'open' && status !== 'closing-soon')) &&
                        Array.from({ length: outcomeCount }, (_, i) => {
                          const totalBn = pariTotalPoolBn;
                          const poolBn = bnFromAnchor(
                            (pariState as { outcomePools?: unknown[] }).outcomePools?.[i]
                          );
                          const dec = Number(market.collateralDecimals);
                          const pct = poolSharePercent(poolBn, totalBn);
                          const accent = PARI_OUTCOME_ACCENTS[i % PARI_OUTCOME_ACCENTS.length];
                          const yourStakeBn = pariStakesByOutcome?.[i] ?? new BN(0);
                          const userPctInOutcome = stakeShareOfOutcomePool(yourStakeBn, poolBn);
                          const showBrightSegment =
                            wallet.publicKey && yourStakeBn.gtn(0) && userPctInOutcome > 0;
                          const showYourStakePanel =
                            wallet.publicKey &&
                            (pariStakesByOutcome === null || yourStakeBn.gtn(0));
                          const isWinningOutcome =
                            resolvedWinnerIdx !== null && resolvedWinnerIdx === i;
                          return (
                            <div
                              key={i}
                              className={`space-y-3 rounded-xl border p-3 transition-colors ${
                                isWinningOutcome
                                  ? 'border-primary/40 bg-primary/5'
                                  : 'border-transparent'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-on-surface">
                                    {outcomeLabels[i]}
                                    {isWinningOutcome && (
                                      <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                                        Winner
                                      </span>
                                    )}
                                  </p>
                                  <p className="mt-1 text-xs text-on-surface-variant">
                                    Total pool:{' '}
                                    <span className="font-mono tabular-nums text-on-surface-variant">
                                      {formatRawCollateralAmount(poolBn, dec)} {poolUnitLabel}
                                    </span>{' '}
                                    ({formatPoolShareOfTotal(poolBn, totalBn)})
                                  </p>
                                </div>
                                {showYourStakePanel && (
                                  <div className="shrink-0 text-right">
                                    <p
                                      className={`text-[10px] font-black uppercase tracking-widest ${accent.stake}`}
                                    >
                                      Your stake
                                    </p>
                                    <p className="mt-1 text-right">
                                      {pariStakesByOutcome === null ? (
                                        <span
                                          className={`font-headline text-base font-bold tabular-nums sm:text-lg ${accent.stake}`}
                                        >
                                          …
                                        </span>
                                      ) : (
                                        <span
                                          className={`font-headline text-base font-bold tabular-nums sm:text-lg ${accent.stake}`}
                                        >
                                          {formatRawCollateralAmount(yourStakeBn, dec)}{' '}
                                          {poolUnitLabel}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
                                {poolBn.isZero() ? null : (
                                  <div
                                    className="flex h-full overflow-hidden rounded-full"
                                    style={{ width: `${pct}%` }}
                                  >
                                    {showBrightSegment ? (
                                      <>
                                        <div
                                          className={`h-full shrink-0 ${accent.bright}`}
                                          style={{ width: `${userPctInOutcome}%` }}
                                        />
                                        <div className={`h-full min-w-0 flex-1 ${accent.muted}`} />
                                      </>
                                    ) : (
                                      <div className={`h-full w-full ${accent.muted}`} />
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>

                <div className="col-span-12 space-y-6 lg:col-span-4">
                  {showPariTradingSidebar ? (
                  <>
                  <div className="rounded-xl border border-secondary/25 bg-secondary/5 p-5">
                    <h3 className="text-sm font-bold text-on-surface">Add stake</h3>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-outline">
                      Outcome
                    </p>
                    <div className="mt-3 space-y-2">
                      {Array.from({ length: outcomeCount }, (_, i) => {
                        const sel = pariStakeOutcomeIdx === i;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setPariStakeOutcomeIdx(i)}
                            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                              sel
                                ? 'border-secondary/40 bg-secondary/15 text-on-surface'
                                : 'border-outline-variant/15 bg-surface-container-low/80 text-on-surface-variant hover:border-outline-variant/30'
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                sel ? 'border-secondary bg-secondary/20' : 'border-outline'
                              }`}
                            >
                              {sel && (
                                <span className="material-symbols-outlined text-[14px] text-secondary">
                                  check
                                </span>
                              )}
                            </span>
                            {outcomeLabels[i]}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4">
                      <label className="block text-xs font-medium text-outline">
                        Amount to pool
                      </label>
                      <p className="mt-0.5 text-[10px] text-on-surface-variant leading-snug">
                        This is the stake credited to the pool; fees are added on top (see total below).
                      </p>
                      <div className="mt-1 flex gap-2">
                        <input
                          type="text"
                          value={mintHuman}
                          onChange={(e) => setMintHuman(e.target.value)}
                          className="input min-w-0 flex-1 font-mono tabular-nums"
                          placeholder="0.00"
                        />
                        <TokenBadge
                          mint={collateralMint}
                          display={collateralDisplay}
                          decimals={Number(market.collateralDecimals)}
                          variant="chip"
                        />
                      </div>
                    </div>
                    {pariStakeFeePreview && market && (
                      <div className="mt-4 rounded-lg border border-outline-variant/15 bg-surface-container-lowest/90 p-3 text-xs">
                        <div className="flex justify-between gap-3 border-b border-outline-variant/10 pb-2">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-outline">
                              Total you pay
                            </p>
                            <p className="mt-0.5 text-[10px] text-on-surface-variant">
                              Collateral debited from your wallet
                            </p>
                          </div>
                          <p className="shrink-0 text-right font-headline text-lg font-black tabular-nums text-secondary">
                            {formatRawCollateralAmount(
                              pariStakeFeePreview.gross,
                              Number(market.collateralDecimals)
                            )}{' '}
                            {poolUnitLabel}
                          </p>
                        </div>
                        <div className="mt-2 flex justify-between gap-2 text-on-surface-variant">
                          <span>Credited to pool</span>
                          <span className="font-mono font-semibold tabular-nums text-on-surface">
                            {formatRawCollateralAmount(
                              pariStakeFeePreview.netToPool,
                              Number(market.collateralDecimals)
                            )}{' '}
                            {poolUnitLabel}
                          </span>
                        </div>
                        {pariPlatformFeeLamports > 0 && (
                          <p className="mt-2 text-[10px] text-outline">
                            + {pariPlatformFeeLamports.toLocaleString()} lamports SOL from wallet (same
                            tx).
                          </p>
                        )}
                        <details className="group mt-3 rounded-lg border border-outline-variant/10 bg-surface-container-low/50">
                          <summary className="cursor-pointer list-none px-2 py-2 text-[10px] font-black uppercase tracking-widest text-outline marker:content-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
                            <span>Fee breakdown</span>
                            <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-180">
                              expand_more
                            </span>
                          </summary>
                          <dl className="space-y-1.5 border-t border-outline-variant/10 px-2 py-2">
                            <div className="flex justify-between gap-2">
                              <dt className="text-on-surface-variant">
                                Platform ({formatBpsAsPercent(depositPlatformBpsEffective)})
                              </dt>
                              <dd className="font-mono tabular-nums text-outline">
                                {formatRawCollateralAmount(
                                  pariStakeFeePreview.platformFee,
                                  Number(market.collateralDecimals)
                                )}{' '}
                                {poolUnitLabel}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-on-surface-variant">
                                Creator ({formatBpsAsPercent(Number(market.creatorFeeBps ?? 0))})
                              </dt>
                              <dd className="font-mono tabular-nums text-outline">
                                {formatRawCollateralAmount(
                                  pariStakeFeePreview.creatorFee,
                                  Number(market.collateralDecimals)
                                )}{' '}
                                {poolUnitLabel}
                              </dd>
                            </div>
                          </dl>
                        </details>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={busy || !marketAcceptsCollateral || !pariStakeFeePreview}
                      onClick={handlePariStake}
                      className="btn-primary mt-4 w-full py-3 text-base font-bold shadow-lg shadow-primary/20 disabled:opacity-50"
                    >
                      Confirm stake
                    </button>
                  </div>

                  <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/80 p-4 text-xs leading-relaxed text-on-surface-variant">
                    <p className="font-headline text-sm font-bold text-on-surface">
                      How pari-mutuel works
                    </p>
                    <p className="mt-2">
                      After resolution, payout for winners is proportional:{' '}
                      <span className="font-mono text-primary">
                        (your stake / total winning stakes) × entire pool
                      </span>
                      , after fees configured for this market.
                    </p>
                  </div>

                  <details className="group rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 open:border-outline-variant/25 open:bg-surface-container-low/30">
                    <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-start gap-3">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-outline transition-transform group-open:rotate-90">
                          chevron_right
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-headline text-sm font-bold text-on-surface">
                              Early exit &amp; reduce stake
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-outline">
                              Advanced
                            </span>
                          </span>
                          <span className="mt-1 block text-[11px] text-on-surface-variant">
                            Optional — penalties apply. Choose which position to reduce; it does not
                            have to match the outcome selected for add stake.
                          </span>
                        </span>
                      </span>
                    </summary>
                    <div className="space-y-4 border-t border-outline-variant/10 px-4 pb-4 pt-3">
                      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-4">

                        {/* Step 1 — choose outcome */}
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-outline">
                            Outcome to reduce
                          </p>
                          <div className="mt-2 space-y-1.5">
                            {Array.from({ length: outcomeCount }, (_, i) => {
                              const sel = pariWithdrawOutcomeIdx === i;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setPariWithdrawOutcomeIdx(i)}
                                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                                    sel
                                      ? 'border-primary/40 bg-primary/10 text-on-surface'
                                      : 'border-outline-variant/15 bg-surface-container-low/80 text-on-surface-variant hover:border-outline-variant/30'
                                  }`}
                                >
                                  <span
                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                      sel ? 'border-primary bg-primary/15' : 'border-outline'
                                    }`}
                                  >
                                    {sel && (
                                      <span className="material-symbols-outlined text-[12px] text-primary">
                                        check
                                      </span>
                                    )}
                                  </span>
                                  {outcomeLabels[i]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Step 2 — active stake for selected outcome */}
                        <div className="flex items-center justify-between rounded-lg border border-outline-variant/15 bg-surface-container-lowest/80 px-3 py-2.5">
                          <span className="text-xs text-on-surface-variant">Your active stake</span>
                          <span className="font-mono text-sm font-bold text-on-surface">
                            {pariPositionStake !== null && pariPositionStake.gtn(0) && market
                              ? `${formatRawCollateralAmount(
                                  pariPositionStake,
                                  Number(market.collateralDecimals)
                                )} ${poolUnitLabel}`
                              : <span className="text-outline font-normal text-xs">No stake on this outcome</span>}
                          </span>
                        </div>

                        {/* Step 3 — amount to remove + Max */}
                        <div>
                          <label className="block text-xs font-medium text-outline">
                            Amount to remove (gross)
                          </label>
                          <div className="mt-1 flex gap-2">
                            <input
                              type="text"
                              value={pariWithdrawHuman}
                              onChange={(e) => setPariWithdrawHuman(e.target.value)}
                              className={`input min-w-0 flex-1 font-mono tabular-nums ${
                                pariWithdrawExceedsActiveStake
                                  ? 'border-error/60 ring-1 ring-error/25 focus:border-error'
                                  : ''
                              }`}
                              placeholder="0.00"
                              aria-invalid={pariWithdrawExceedsActiveStake}
                            />
                            <TokenBadge
                              mint={collateralMint}
                              display={collateralDisplay}
                              decimals={Number(market.collateralDecimals)}
                              variant="chip"
                            />
                            {pariPositionStake !== null && market && pariPositionStake.gtn(0) && (
                              <button
                                type="button"
                                disabled={busy || !marketAcceptsCollateral}
                                onClick={() =>
                                  setPariWithdrawHuman(
                                    formatRawCollateralAmount(
                                      pariPositionStake,
                                      Number(market.collateralDecimals)
                                    )
                                  )
                                }
                                className="btn-ghost shrink-0 text-sm disabled:opacity-50"
                              >
                                Max
                              </button>
                            )}
                          </div>
                          {pariWithdrawExceedsActiveStake && (
                            <p className="mt-1.5 text-[11px] text-error">
                              Cannot exceed your active stake of{' '}
                              {pariPositionStake !== null && market
                                ? `${formatRawCollateralAmount(
                                    pariPositionStake,
                                    Number(market.collateralDecimals)
                                  )} ${poolUnitLabel}`
                                : '—'}.
                            </p>
                          )}
                        </div>

                        {/* Step 4 — fee breakdown (only when user entered a valid amount) */}
                        {pariWithdrawPreview && market && !pariWithdrawExceedsActiveStake && (
                          <div className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest/90 p-3 text-xs">
                            <p className="text-[10px] font-black uppercase tracking-widest text-outline">
                              Withdrawal breakdown
                            </p>
                            <dl className="mt-2 space-y-1.5">
                              <div className="flex justify-between gap-2">
                                <dt className="text-on-surface-variant">
                                  Early exit penalty (
                                  {pariState
                                    ? formatBpsAsPercent(
                                        Number(
                                          (pariState as { earlyWithdrawPenaltyBps?: number })
                                            .earlyWithdrawPenaltyBps ?? 0
                                        )
                                      )
                                    : '—'}
                                  )
                                </dt>
                                <dd className="font-mono tabular-nums text-error">
                                  −{formatRawCollateralAmount(
                                    pariWithdrawPreview.penalty,
                                    Number(market.collateralDecimals)
                                  )}{' '}
                                  {poolUnitLabel}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-2">
                                <dt className="text-on-surface-variant">
                                  Platform fee ({formatBpsAsPercent(pariWithdrawPlatformFeeBps)})
                                </dt>
                                <dd className="font-mono tabular-nums text-outline">
                                  −{formatRawCollateralAmount(
                                    pariWithdrawPreview.withdrawPlatformFee,
                                    Number(market.collateralDecimals)
                                  )}{' '}
                                  {poolUnitLabel}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-2 border-t border-outline-variant/10 pt-2 font-semibold">
                                <dt className="text-primary">You receive</dt>
                                <dd className="font-mono tabular-nums text-primary">
                                  {formatRawCollateralAmount(
                                    pariWithdrawPreview.userRefund,
                                    Number(market.collateralDecimals)
                                  )}{' '}
                                  {poolUnitLabel}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        )}

                        {/* Withdraw button */}
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !marketAcceptsCollateral ||
                            !pariPositionStake ||
                            !pariPositionStake.gtn(0) ||
                            pariWithdrawExceedsActiveStake
                          }
                          onClick={handlePariWithdraw}
                          className="btn-secondary w-full disabled:opacity-50"
                        >
                          {!pariPositionStake?.gtn(0)
                            ? 'No active stake on this outcome'
                            : pariWithdrawExceedsActiveStake
                              ? 'Amount above active stake'
                              : 'Withdraw early'}
                        </button>
                      </div>
                    </div>
                  </details>
                  </>
                  ) : market.voided ? (
                  <div className="rounded-xl border border-error/25 bg-error/5 p-5">
                    <h3 className="text-sm font-bold text-error">Market voided</h3>
                    <p className="mt-2 text-xs text-on-surface-variant leading-relaxed">
                      This market was voided. Staking and claims follow protocol rules for voided
                      pools.
                    </p>
                  </div>
                  ) : winningLabel ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-primary/30 bg-primary/10 p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                        Winning outcome
                      </p>
                      <p className="mt-2 font-headline text-xl font-bold text-on-surface">
                        {winningLabel}
                      </p>
                      <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                        Staking and early exit are closed. Payouts are pro-rata for stakes on this
                        outcome.
                      </p>
                    </div>
                    {wallet.publicKey && marketIdBn ? (
                      hasPariWinningStakeToClaim ? (
                        <div className="space-y-3">
                          {pariClaimPreview && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">
                                Estimated payout
                              </p>
                              <p className="mt-0.5 font-headline text-2xl font-black tabular-nums text-primary">
                                {formatRawCollateralAmount(
                                  pariClaimPreview,
                                  Number(market.collateralDecimals)
                                )}{' '}
                                {poolUnitLabel}
                              </p>
                              <p className="mt-1 text-[10px] text-on-surface-variant">
                                Pro-rata share of the entire pool
                              </p>
                            </div>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={handlePariClaim}
                            className="btn-primary w-full py-3 text-base font-bold shadow-lg shadow-primary/20 disabled:opacity-50"
                          >
                            Claim pari-mutuel winnings
                          </button>
                        </div>
                      ) : pariLastClaimedAmount ? (
                        <div className="rounded-lg border border-secondary/25 bg-secondary/5 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-secondary text-[18px]">
                              check_circle
                            </span>
                            <p className="text-[10px] font-black uppercase tracking-widest text-secondary">
                              Winnings claimed
                            </p>
                          </div>
                          <p className="mt-1 font-headline text-xl font-black tabular-nums text-on-surface">
                            {formatRawCollateralAmount(
                              pariLastClaimedAmount,
                              Number(market.collateralDecimals)
                            )}{' '}
                            {poolUnitLabel}
                          </p>
                          <p className="mt-1 text-[10px] text-on-surface-variant">
                            Sent to your wallet.
                          </p>
                        </div>
                      ) : (
                        <p className="rounded-lg border border-outline-variant/15 bg-surface-container-low/80 px-3 py-2 text-xs text-on-surface-variant">
                          No winning stake on this wallet for this market.
                        </p>
                      )
                    ) : (
                      <p className="text-xs text-outline">
                        Connect your wallet to claim if you staked on{' '}
                        <span className="font-semibold text-on-surface">{winningLabel}</span>.
                      </p>
                    )}
                  </div>
                  ) : (
                  <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-5">
                    <h3 className="text-sm font-bold text-on-surface">Trading closed</h3>
                    <p className="mt-2 text-xs text-on-surface-variant leading-relaxed">
                      This market is not accepting new stakes. The winning outcome is not finalized
                      on-chain yet.
                    </p>
                  </div>
                  )}
                </div>
              </div>
            )}

            {resolvedWinnerIdx !== null && !market.voided && !isParimutuelMarket(market) && (
              <section>
                <h2 className="text-lg font-bold text-on-surface">
                  Claim payout
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  After resolution, redeem winning outcome tokens for {poolUnitLabel}.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-outline">
                      Amount (winning tokens)
                    </label>
                    <input
                      type="text"
                      value={winHuman}
                      onChange={(e) => setWinHuman(e.target.value)}
                      className="input w-32"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRedeemWinning}
                    className="btn-primary disabled:opacity-50"
                  >
                    Redeem for {poolUnitLabel}
                  </button>
                </div>
              </section>
            )}

            <details className="group rounded-xl border border-outline-variant/10 bg-surface-container-lowest/40 p-4">
              <summary className="cursor-pointer list-none font-bold text-on-surface marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-outline transition-transform group-open:rotate-90">
                    chevron_right
                  </span>
                  Resolvers &amp; resolution
                </span>
              </summary>
              <p className="mt-2 text-sm text-on-surface-variant">
                Assigned wallets vote on the winning outcome; when enough agree, anyone can finalize.
              </p>
              {resolverSlot !== null && resolutionVoteState === undefined && (
                <p className="mt-2 text-xs text-outline">
                  Checking on-chain vote status…
                </p>
              )}
              {resolverSlot !== null &&
                resolutionVoteState?.hasVoted &&
                resolvedWinnerIdx === null &&
                !market.voided && (
                  <p className="mt-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-on-surface">
                    Your vote is recorded:{' '}
                    <span className="font-semibold text-primary">
                      {outcomeLabels[
                        Math.min(
                          Math.max(0, resolutionVoteState.outcomeIndex),
                          outcomeCount - 1
                        )
                      ]}
                    </span>
                    . Revoke below if you need to change it.
                  </p>
                )}
              {resolverSlot !== null &&
                resolutionVoteState?.hasVoted &&
                (resolvedWinnerIdx !== null || market.voided) && (
                  <p className="mt-2 rounded-lg border border-outline-variant/20 bg-surface-container-high/40 px-3 py-2 text-sm text-on-surface-variant">
                    You voted for{' '}
                    <span className="font-medium text-on-surface">
                      {outcomeLabels[
                        Math.min(
                          Math.max(0, resolutionVoteState.outcomeIndex),
                          outcomeCount - 1
                        )
                      ]}
                    </span>
                    . This market is no longer open for resolution votes.
                  </p>
                )}
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-outline">Vote for</label>
                  <select
                    value={voteOutcome}
                    onChange={(e) => setVoteOutcome(Number(e.target.value))}
                    disabled={
                      resolverSlot !== null &&
                      (resolutionVoteState === undefined ||
                        resolutionVoteState?.hasVoted ||
                        market.voided ||
                        resolvedWinnerIdx !== null)
                    }
                    className="input min-w-[12rem] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {Array.from({ length: outcomeCount }, (_, i) => (
                      <option key={i} value={i}>
                        {outcomeLabels[i]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={
                    busy ||
                    resolverSlot === null ||
                    resolutionVoteState === undefined ||
                    resolutionVoteState?.hasVoted ||
                    market.voided ||
                    resolvedWinnerIdx !== null
                  }
                  onClick={handleVote}
                  className="btn-primary disabled:opacity-50"
                >
                  Submit vote
                  {resolverSlot !== null ? ` (resolver ${resolverSlot})` : ' (not a resolver)'}
                </button>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !resolutionVoteState?.hasVoted ||
                    resolutionVoteState === undefined ||
                    market.voided ||
                    resolvedWinnerIdx !== null
                  }
                  onClick={handleRevokeVote}
                  className="btn-secondary disabled:opacity-50"
                >
                  Revoke my vote
                </button>
                <button
                  type="button"
                  disabled={
                    busy ||
                    resolvedWinnerIdx !== null ||
                    market.voided ||
                    outcomeTallyCounts === null ||
                    !talliesMeetResolutionThreshold
                  }
                  onClick={handleFinalize}
                  className="btn-secondary disabled:opacity-50"
                >
                  Finalize resolution
                </button>
              </div>
              {outcomeTallyCounts !== null &&
                !talliesMeetResolutionThreshold &&
                resolvedWinnerIdx === null &&
                !market.voided && (
                  <p className="mt-3 text-xs text-outline leading-relaxed">
                    Finalize stays off until at least{' '}
                    <span className="font-semibold text-on-surface-variant">
                      {Number(market.resolutionThreshold)}
                    </span>{' '}
                    resolver
                    {Number(market.resolutionThreshold) === 1 ? '' : 's'} record the same outcome
                    (on-chain tally).
                  </p>
                )}
            </details>

            {resolvedWinnerIdx === null && !market.voided && (
            <details className="group rounded-xl border border-outline-variant/10 bg-surface-container-lowest/40 p-4">
              <summary className="cursor-pointer list-none font-bold text-on-surface marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-outline transition-transform group-open:rotate-90">
                    chevron_right
                  </span>
                  Close early or void
                </span>
              </summary>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                On-chain, only the <strong className="text-on-surface">market creator</strong> or a{' '}
                <strong className="text-on-surface">global config authority</strong> (primary or
                secondary) can trigger these actions. Assigned resolvers cannot close or void a market.
              </p>
              {!canCloseOrVoidMarket && (
                <p className="mt-2 text-xs text-outline">
                  Your connected wallet is not the creator and is not a global config authority, so
                  transactions would fail if you tried.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy || !canCloseOrVoidMarket}
                  onClick={handleCloseEarly}
                  className="btn-secondary disabled:opacity-50"
                >
                  Close market early
                </button>
                <button
                  type="button"
                  disabled={busy || !canCloseOrVoidMarket}
                  onClick={handleVoid}
                  className="btn-secondary disabled:opacity-50"
                >
                  Void market
                </button>
              </div>
            </details>
            )}
          </>
        )}

        <div className="flex flex-col gap-4 border-t border-outline-variant/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <Link
              to={`/markets/creator/${encodeURIComponent(creatorPk)}`}
              className="group flex min-w-0 items-center gap-3 rounded-xl -m-2 p-2 text-left transition-colors hover:bg-surface-container-high/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              title="View all markets by this creator"
            >
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/20 ring-2 ring-primary/15">
                <span className="material-symbols-outlined text-[22px] text-primary">person</span>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-outline">
                  Market creator
                </p>
                <p className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold text-on-surface group-hover:text-primary transition-colors">
                  <span className="truncate">{creatorLabel}</span>
                  {creatorNamed && (
                    <span className="shrink-0 font-mono text-sm font-normal text-outline">
                      ({shortAddr(creatorPk)})
                    </span>
                  )}
                  {creatorProfile?.verified && (
                    <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-secondary">
                      <span
                        className="material-symbols-outlined text-[16px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        verified_user
                      </span>
                      Yes
                    </span>
                  )}
                </p>
                {!creatorNamed && (
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-primary/90 opacity-0 transition-opacity group-hover:opacity-100">
                    All markets by this wallet
                  </p>
                )}
              </div>
            </Link>
            {creatorProfile?.url?.trim() && (
              <a
                href={
                  creatorProfile.url.trim().match(/^https?:\/\//i)
                    ? creatorProfile.url.trim()
                    : `https://${creatorProfile.url.trim()}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block max-w-full truncate pl-14 text-xs font-medium text-primary hover:underline"
              >
                {creatorProfile.url.trim()}
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => shareMarketLink()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-xs font-bold uppercase tracking-wider text-outline hover:border-primary/30 hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
              Share
            </button>
            <Link
              to={`/markets/creator/${encodeURIComponent(creatorPk)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-xs font-bold uppercase tracking-wider text-outline hover:border-primary/30 hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">grid_view</span>
              Creator's markets
            </Link>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

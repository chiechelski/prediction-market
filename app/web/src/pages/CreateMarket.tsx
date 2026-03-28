import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WalletSignTransactionError } from '@solana/wallet-adapter-base';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { createMarketFullFlow } from '@/lib/marketActions';
import { registerMarket } from '@/lib/marketRegistry';
import {
  MIN_LAMPORTS_CREATE_MARKET,
  formatInsufficientSolMessage,
  formatSol,
} from '@/lib/solBalance';
import {
  formatUtcFromUnixSeconds,
  localDatetimeInputToUnixSeconds,
  toDatetimeLocalInputValue,
} from '@/lib/datetimeLocal';
import { fetchMarketCategories, type ChainMarketCategory } from '@/lib/marketDiscovery';
import { formatBpsAsPercent } from '@/lib/bps';
import { useToast } from '@/context/ToastContext';

function parseExtraPubkeys(text: string): PublicKey[] {
  const parts = text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: PublicKey[] = [];
  for (const p of parts) {
    try {
      out.push(new PublicKey(p));
    } catch {
      throw new Error(`Invalid pubkey: ${p}`);
    }
  }
  return out;
}

export default function CreateMarket() {
  const navigate = useNavigate();
  const { connection } = useConnection();
  const wallet = useWallet();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solBalanceLamports, setSolBalanceLamports] = useState<number | null>(
    null
  );
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [outcomeCount, setOutcomeCount] = useState(2);
  const [outcomeLabels, setOutcomeLabels] = useState<string[]>(['Yes', 'No']);
  /** String inputs so users can clear/edit without number inputs fighting back (e.g. "02"). */
  const [outcomeCountStr, setOutcomeCountStr] = useState('2');
  const [resolutionThresholdStr, setResolutionThresholdStr] = useState('1');
  const [closeAtLocalStr, setCloseAtLocalStr] = useState(() => {
    const d = new Date();
    d.setTime(d.getTime() + 7 * 86400 * 1000);
    return toDatetimeLocalInputValue(d);
  });
  const [creatorFeeBpsStr, setCreatorFeeBpsStr] = useState('50');
  const [marketTitle, setMarketTitle] = useState('');
  const [creatorDisplayName, setCreatorDisplayName] = useState('');
  const [detailsText, setDetailsText] = useState('');
  /** Empty string = uncategorized on-chain. Otherwise base58 category PDA. */
  const [categoryPubkey, setCategoryPubkey] = useState('');
  const [chainCategories, setChainCategories] = useState<ChainMarketCategory[]>(
    []
  );
  const [collateralMintStr, setCollateralMintStr] = useState(
    import.meta.env.VITE_COLLATERAL_MINT ?? ''
  );
  const [extraResolvers, setExtraResolvers] = useState('');
  /** Complete-set (SPL tokens) vs pari-mutuel ledger pool. */
  const [marketMode, setMarketMode] = useState<'completeSet' | 'parimutuel'>(
    'completeSet'
  );

  const updateOutcomeLabels = (n: number) => {
    setOutcomeCount(n);
    const next = outcomeLabels.slice(0, n);
    while (next.length < n) next.push(`Outcome ${next.length + 1}`);
    setOutcomeLabels(next);
  };

  const parseIntLoose = (s: string): number | null => {
    const t = s.trim();
    if (t === '') return null;
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? null : n;
  };

  const outcomeParsed = parseIntLoose(outcomeCountStr);
  const outcomeFieldInvalid =
    outcomeParsed === null || outcomeParsed < 2 || outcomeParsed > 8;

  const resolutionParsed = parseIntLoose(resolutionThresholdStr);
  const resolutionFieldInvalid =
    resolutionParsed === null || resolutionParsed < 1 || resolutionParsed > 8;

  let closeAtUnixPreview: number | null = null;
  try {
    closeAtUnixPreview = localDatetimeInputToUnixSeconds(closeAtLocalStr);
  } catch {
    closeAtUnixPreview = null;
  }
  const nowUnix = Math.floor(Date.now() / 1000);
  const closeAtFieldInvalid =
    closeAtUnixPreview === null || closeAtUnixPreview <= nowUnix + 60;

  const feeBpsParsed = parseIntLoose(creatorFeeBpsStr);
  const feeBpsFieldInvalid =
    feeBpsParsed === null || feeBpsParsed < 0 || feeBpsParsed > 10000;

  const numericFieldsInvalid =
    outcomeFieldInvalid ||
    resolutionFieldInvalid ||
    closeAtFieldInvalid ||
    feeBpsFieldInvalid;

  const inputErrorClass = (invalid: boolean) =>
    invalid ? 'input mt-1 border-error/60 ring-1 ring-error/25' : 'input mt-1';

  useEffect(() => {
    let cancelled = false;
    const pk = wallet.publicKey;
    if (!pk) {
      setSolBalanceLamports(null);
      setBalanceLoading(false);
      return;
    }
    setBalanceLoading(true);
    (async () => {
      try {
        const b = await connection.getBalance(pk);
        if (!cancelled) setSolBalanceLamports(b);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    const subId = connection.onAccountChange(pk, () => {
      connection.getBalance(pk).then((b) => {
        if (!cancelled) setSolBalanceLamports(b);
      });
    });
    return () => {
      cancelled = true;
      connection.removeAccountChangeListener(subId);
    };
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    let cancelled = false;
    fetchMarketCategories(connection)
      .then((rows) => {
        if (!cancelled) setChainCategories(rows.filter((c) => c.active));
      })
      .catch(() => {
        if (!cancelled) setChainCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const insufficientSol =
    solBalanceLamports !== null &&
    solBalanceLamports < MIN_LAMPORTS_CREATE_MARKET;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey) {
      setError('Connect your wallet');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const oc = parseIntLoose(outcomeCountStr);
      if (oc === null || oc < 2 || oc > 8) {
        throw new Error('Number of outcomes must be between 2 and 8');
      }
      const rt = parseIntLoose(resolutionThresholdStr);
      if (rt === null || rt < 1 || rt > 8) {
        throw new Error('Resolution threshold must be between 1 and 8');
      }
      const title = marketTitle.trim();
      if (!title) {
        throw new Error('Enter a market title');
      }
      const closeAtUnix = localDatetimeInputToUnixSeconds(closeAtLocalStr);
      if (closeAtUnix <= Math.floor(Date.now() / 1000) + 60) {
        throw new Error('Close date and time must be at least ~1 minute in the future');
      }
      const fee = parseIntLoose(creatorFeeBpsStr);
      if (fee === null || fee < 0 || fee > 10000) {
        throw new Error('Creator fee must be between 0 and 10000 basis points');
      }

      const mintStr =
        collateralMintStr.trim() ||
        import.meta.env.VITE_COLLATERAL_MINT ||
        'So11111111111111111111111111111111111111112';
      const collateralMint = new PublicKey(mintStr);

      const extras = parseExtraPubkeys(extraResolvers);
      const resolverPubkeys = [wallet.publicKey, ...extras].slice(0, 8);
      const numResolvers = resolverPubkeys.length;

      if (rt > numResolvers) {
        throw new Error('Resolution threshold cannot exceed number of resolvers');
      }

      const marketId = new BN(Math.floor(Math.random() * 1_000_000_000));
      const closeAt = new BN(closeAtUnix);

      const outcomeLabelStr =
        outcomeLabels.slice(0, oc).join(' / ') || 'Yes / No';

      const catPk =
        categoryPubkey.trim() === ''
          ? null
          : new PublicKey(categoryPubkey.trim());
      const categoryLabelForRegistry =
        categoryPubkey.trim() === ''
          ? undefined
          : chainCategories.find(
              (c) => c.pubkey.toBase58() === categoryPubkey.trim()
            )?.name;

      const { marketPda } = await createMarketFullFlow(connection, wallet, {
        marketId,
        outcomeCount: oc,
        resolutionThreshold: rt,
        closeAt,
        creatorFeeBps: fee,
        depositPlatformFeeBps: 0,
        collateralMint,
        resolverPubkeys,
        title,
        marketCategory: catPk,
        marketType: marketMode === 'parimutuel' ? 'parimutuel' : 'completeSet',
      });

      registerMarket({
        marketPda: marketPda.toBase58(),
        creator: wallet.publicKey.toBase58(),
        marketId: marketId.toString(),
        title,
        category: categoryLabelForRegistry,
        label: outcomeLabelStr,
        creatorDisplayName: creatorDisplayName.trim() || undefined,
        detailsText: detailsText.trim() || undefined,
      });

      toast.success('Market created.');
      navigate(`/market/${marketPda.toBase58()}`);
    } catch (err: unknown) {
      let message =
        err instanceof Error ? err.message : 'Transaction failed';
      if (err instanceof WalletSignTransactionError && wallet.publicKey) {
        try {
          const bal = await connection.getBalance(wallet.publicKey);
          if (bal < MIN_LAMPORTS_CREATE_MARKET) {
            message = formatInsufficientSolMessage(bal);
          } else if (message === 'Unexpected error' || !message.trim()) {
            message =
              'Could not sign the transaction. Check that your wallet is unlocked and try again.';
          }
        } catch {
          /* keep message */
        }
      }
      setError(message);
      toast.error(message);
      try {
        if (wallet.publicKey) {
          const b = await connection.getBalance(wallet.publicKey);
          setSolBalanceLamports(b);
        }
      } catch {
        /* ignore */
      }
    } finally {
      setLoading(false);
    }
  };

  if (!wallet.publicKey) {
    return (
      <div className="card p-8 text-center">
        <p className="text-on-surface-variant">Connect your wallet to create a market.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-dim px-4 pt-8 pb-12 md:px-6 lg:px-8">
    <div className="mx-auto w-full max-w-7xl">
      <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface italic mb-1">
        Create market
      </h1>
      <p className="text-outline font-medium">
        Creates the market account and resolver accounts. Complete-set markets add
        outcome mints; pari-mutuel markets add a pool account instead (three
        transactions).
      </p>

      <div className="mt-6 max-w-3xl rounded-xl border border-outline/15 bg-surface px-4 py-3 text-sm">
        {balanceLoading ? (
          <p className="text-outline">Loading wallet balance…</p>
        ) : solBalanceLamports !== null ? (
          <>
            <p className="text-on-surface">
              Wallet balance:{' '}
              <span className="font-mono font-medium">
                {formatSol(solBalanceLamports)} SOL
              </span>
            </p>
            {insufficientSol && (
              <p className="mt-2 text-error">
                Not enough SOL to pay fees and rent (need about{' '}
                {formatSol(MIN_LAMPORTS_CREATE_MARKET)} SOL). Fund this
                wallet on your current cluster, then try again.
              </p>
            )}
          </>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 max-w-3xl space-y-6">
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Market title
          </label>
          <input
            type="text"
            value={marketTitle}
            onChange={(e) => setMarketTitle(e.target.value)}
            placeholder="e.g. Will Team A win the finals?"
            className="input mt-1"
          />
          <p className="mt-1 text-xs text-outline">
            Shown in market lists and search.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Creator display name <span className="text-outline font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={creatorDisplayName}
            onChange={(e) => setCreatorDisplayName(e.target.value)}
            placeholder="Shown on cards and info page (local only)"
            className="input mt-1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Extended description <span className="text-outline font-normal">(optional)</span>
          </label>
          <textarea
            value={detailsText}
            onChange={(e) => setDetailsText(e.target.value)}
            placeholder="Rules, resolution sources, links — stored in this browser only"
            className="input mt-1 min-h-[100px] text-sm"
            rows={4}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Category
          </label>
          <select
            value={categoryPubkey}
            onChange={(e) => setCategoryPubkey(e.target.value)}
            className="input mt-1"
          >
            <option value="">Uncategorized</option>
            {chainCategories.map((c) => (
              <option key={c.pubkey.toBase58()} value={c.pubkey.toBase58()}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-outline">
            On-chain category PDAs created on the Platform page. Optional local label
            is saved in this browser for markets in your registry.
          </p>
        </div>
        <div>
          <span className="block text-sm font-medium text-on-surface">
            Market mechanics
          </span>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant">
              <input
                type="radio"
                name="marketMode"
                checked={marketMode === 'completeSet'}
                onChange={() => setMarketMode('completeSet')}
                className="h-4 w-4"
              />
              Complete-set (outcome tokens — mint/redeem full set)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant">
              <input
                type="radio"
                name="marketMode"
                checked={marketMode === 'parimutuel'}
                onChange={() => setMarketMode('parimutuel')}
                className="h-4 w-4"
              />
              Pari-mutuel (stake on one outcome; pro-rata pool payout)
            </label>
          </div>
          <p className="mt-1 text-xs text-outline">
            Pari-mutuel uses on-chain pool accounting only (no SPL outcome mints).
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Collateral mint
          </label>
          <input
            type="text"
            value={collateralMintStr}
            onChange={(e) => setCollateralMintStr(e.target.value)}
            placeholder="Pubkey (must be on platform allowlist)"
            className="input mt-1 font-mono text-sm"
          />
          <p className="mt-1 text-xs text-outline">
            Defaults to VITE_COLLATERAL_MINT or wrapped SOL if empty.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Number of outcomes (2–8)
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={outcomeCountStr}
            onChange={(e) => {
              const v = e.target.value;
              setOutcomeCountStr(v);
              const n = parseIntLoose(v);
              if (n !== null && n >= 2 && n <= 8) updateOutcomeLabels(n);
            }}
            onBlur={() => {
              const n = parseIntLoose(outcomeCountStr);
              if (n !== null && n >= 2 && n <= 8) {
                setOutcomeCountStr(String(n));
              } else {
                setOutcomeCountStr(String(outcomeCount));
              }
            }}
            className={inputErrorClass(outcomeFieldInvalid)}
            aria-invalid={outcomeFieldInvalid}
          />
          {outcomeFieldInvalid && (
            <p className="mt-1 text-xs text-error">Enter a whole number from 2 to 8.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Outcome labels
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {outcomeLabels.map((label, i) => (
              <input
                key={i}
                type="text"
                value={label}
                onChange={(e) => {
                  const next = [...outcomeLabels];
                  next[i] = e.target.value;
                  setOutcomeLabels(next);
                }}
                className="input w-32"
                placeholder={`Outcome ${i + 1}`}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Additional resolver pubkeys
          </label>
          <textarea
            value={extraResolvers}
            onChange={(e) => setExtraResolvers(e.target.value)}
            placeholder="Comma or newline separated. Your wallet is always resolver #0."
            className="input mt-1 min-h-[80px] font-mono text-sm"
            rows={3}
          />
          <p className="mt-1 text-xs text-outline">
            Resolvers: your wallet first, then these (max 8 total).
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Resolution threshold (M-of-N)
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={resolutionThresholdStr}
            onChange={(e) => setResolutionThresholdStr(e.target.value)}
            onBlur={() => {
              const n = parseIntLoose(resolutionThresholdStr);
              if (n !== null && n >= 1 && n <= 8) {
                setResolutionThresholdStr(String(n));
              } else {
                setResolutionThresholdStr('1');
              }
            }}
            className={inputErrorClass(resolutionFieldInvalid)}
            aria-invalid={resolutionFieldInvalid}
          />
          {resolutionFieldInvalid && (
            <p className="mt-1 text-xs text-error">Enter 1–8 (must not exceed resolver count on submit).</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Close date &amp; time
          </label>
          <input
            type="datetime-local"
            autoComplete="off"
            min={toDatetimeLocalInputValue(new Date())}
            value={closeAtLocalStr}
            onChange={(e) => setCloseAtLocalStr(e.target.value)}
            className={inputErrorClass(closeAtFieldInvalid)}
            aria-invalid={closeAtFieldInvalid}
          />
          <p className="mt-1 text-xs text-outline">
            Times are in your timezone (
            {Intl.DateTimeFormat().resolvedOptions().timeZone}). On-chain close is{' '}
            <span className="font-mono text-on-surface-variant">
              {closeAtUnixPreview !== null
                ? formatUtcFromUnixSeconds(closeAtUnixPreview)
                : '—'}
            </span>
            .
          </p>
          {closeAtFieldInvalid && (
            <p className="mt-1 text-xs text-error">
              Pick a moment at least ~1 minute in the future.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface">
            Creator fee (basis points, 0–10000){' '}
            {feeBpsParsed !== null && feeBpsParsed >= 0 && feeBpsParsed <= 10000 && (
              <span className="font-normal text-outline">
                ({formatBpsAsPercent(feeBpsParsed)})
              </span>
            )}
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={creatorFeeBpsStr}
            onChange={(e) => setCreatorFeeBpsStr(e.target.value)}
            onBlur={() => {
              const n = parseIntLoose(creatorFeeBpsStr);
              if (n !== null && n >= 0 && n <= 10000) {
                setCreatorFeeBpsStr(String(n));
              } else {
                setCreatorFeeBpsStr('50');
              }
            }}
            className={inputErrorClass(feeBpsFieldInvalid)}
            aria-invalid={feeBpsFieldInvalid}
          />
          {feeBpsFieldInvalid && (
            <p className="mt-1 text-xs text-error">Enter 0–10000.</p>
          )}
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-error/10 border border-error/20 p-3">
            <span className="material-symbols-outlined text-error text-[16px] mt-0.5">error</span>
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
        <button
          type="submit"
          disabled={
            loading ||
            numericFieldsInvalid ||
            balanceLoading ||
            insufficientSol
          }
          className="btn-primary disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create market'}
        </button>
      </form>
    </div>
    </div>
  );
}

import { Link } from 'react-router-dom';

type Status = 'open' | 'closed' | 'resolved' | 'voided';

type MarketCardProps = {
  marketKey: string;
  title?: string;
  outcomes: string[];
  status: Status;
  closeAt?: string;
  resolvedOutcome?: number | null;
};

const statusStyles: Record<Status, string> = {
  open: 'bg-green-100 text-green-800',
  closed: 'bg-surface-200 text-surface-700',
  resolved: 'bg-brand-100 text-brand-800',
  voided: 'bg-amber-100 text-amber-800',
};

export default function MarketCard({
  marketKey,
  title,
  outcomes,
  status,
  closeAt,
  resolvedOutcome,
}: MarketCardProps) {
  return (
    <Link
      to={`/market/${marketKey}`}
      className="card block p-5 text-left transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-surface-900 truncate">
            {title ?? `Market ${marketKey.slice(0, 8)}…`}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {outcomes.map((o, i) => (
              <li
                key={i}
                className="rounded-md bg-surface-100 px-2 py-0.5 text-xs text-surface-600"
              >
                {o}
              </li>
            ))}
          </ul>
          {closeAt && (
            <p className="mt-2 text-xs text-surface-500">Closes: {closeAt}</p>
          )}
          {resolvedOutcome != null && status === 'resolved' && (
            <p className="mt-1 text-xs text-brand-600">
              Resolved: outcome {resolvedOutcome}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}
        >
          {status}
        </span>
      </div>
    </Link>
  );
}

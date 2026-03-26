/**
 * Helpers for <input type="datetime-local"> values in the browser's local timezone.
 * On-chain `closeAt` is Unix seconds (UTC instant); JS Date maps local ↔ UTC correctly.
 */

export function toDatetimeLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse datetime-local string as local wall time → Unix seconds (UTC). */
export function localDatetimeInputToUnixSeconds(value: string): number {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date and time');
  }
  return Math.floor(d.getTime() / 1000);
}

/** Human-readable UTC instant for UI (matches what the chain stores). */
export function formatUtcFromUnixSeconds(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return (
    d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
  );
}

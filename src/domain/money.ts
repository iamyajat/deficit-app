/**
 * Parse a user-typed amount ("6", "6.5", "6.50", "1,000.25") into integer cents.
 * Returns null for anything that isn't a non-negative amount with at most 2 decimals.
 * Never goes through floating point.
 */
export function parseCents(input: string): number | null {
  const s = input.trim().replace(/,/g, '');
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m || (m[1] === '' && !m[2])) return null;
  const whole = m[1] === '' ? 0 : Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + frac;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Format cents for display in an input field, e.g. 650 -> "6.50", 600 -> "6". */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = cents < 0 ? '-' : '';
  return frac === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatCents(
  cents: number,
  currency: string,
  opts: { signed?: boolean } = {},
): string {
  const key = `${currency}|${opts.signed ? 1 : 0}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      signDisplay: opts.signed ? 'exceptZero' : 'auto',
    });
    formatters.set(key, f);
  }
  return f.format(cents / 100);
}

import { nextPeriodStart, periodStart, periodsBetween, shiftPeriods } from './period';
import type { Budget, BudgetRate, Entry, ISODate } from './types';

/**
 * The balance is never stored. It is derived from:
 *   Σ allowance for every period from the budget's first period through the current one
 *   + Σ effect of every (non-deleted) ledger entry.
 * Rollover is therefore implicit: whatever is left (or overspent) simply carries forward.
 */

/** Signed effect of an entry on its budget's balance. */
export function entryEffect(e: Entry): number {
  switch (e.kind) {
    case 'spend':
    case 'to_goal':
      return -e.amountCents;
    case 'from_goal':
    case 'adjust':
      return e.amountCents;
  }
}

export function liveEntries(entries: readonly Entry[]): Entry[] {
  return entries.filter((e) => !e.deletedAt);
}

export function firstPeriod(budget: Budget): ISODate {
  return periodStart(budget.startDate, budget.period, budget.weekStartsOn);
}

export function currentPeriod(budget: Budget, today: ISODate): ISODate {
  return periodStart(today, budget.period, budget.weekStartsOn);
}

/** Rates for one budget, sorted, one per effectiveFrom (later array items win), clamped to the first period. */
function normalizedRates(budget: Budget, rates: readonly BudgetRate[]): { from: ISODate; cents: number }[] {
  const first = firstPeriod(budget);
  const byFrom = new Map<ISODate, number>();
  for (const r of rates) {
    if (r.budgetId !== budget.id) continue;
    const from = periodStart(r.effectiveFrom, budget.period, budget.weekStartsOn);
    byFrom.set(from < first ? first : from, r.amountCents);
  }
  return [...byFrom.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([from, cents]) => ({ from, cents }));
}

/** Allowance for the period starting at `p` (0 if before the budget started). */
export function rateAt(budget: Budget, rates: readonly BudgetRate[], p: ISODate): number {
  if (p < firstPeriod(budget)) return 0;
  let cents = 0;
  for (const r of normalizedRates(budget, rates)) {
    if (r.from <= p) cents = r.cents;
    else break;
  }
  return cents;
}

/** Total allowance accrued from the first period through period `through` (inclusive). */
export function accrued(budget: Budget, rates: readonly BudgetRate[], through: ISODate): number {
  const first = firstPeriod(budget);
  if (through < first) return 0;
  const segs = normalizedRates(budget, rates);
  let total = 0;
  for (let i = 0; i < segs.length; i++) {
    const segStart = segs[i].from;
    if (segStart > through) break;
    const next = segs[i + 1]?.from;
    const segEnd = next && next <= through ? shiftPeriods(next, budget.period, -1) : through;
    total += (periodsBetween(segStart, segEnd, budget.period) + 1) * segs[i].cents;
  }
  return total;
}

/** Current available balance for a budget (what's left to spend right now, including rollover). */
export function balance(
  budget: Budget,
  rates: readonly BudgetRate[],
  entries: readonly Entry[],
  today: ISODate,
): number {
  let total = accrued(budget, rates, currentPeriod(budget, today));
  for (const e of entries) {
    if (e.budgetId === budget.id && !e.deletedAt && e.date <= today) total += entryEffect(e);
  }
  return total;
}

export interface PeriodSummary {
  start: ISODate;
  /** Balance carried in from all previous periods (positive = surplus, negative = overspend). */
  carriedIn: number;
  allowance: number;
  spent: number;
  /** Net amount moved out to goals (to_goal − from_goal). */
  moved: number;
  /** Net manual adjustments (e.g. balance resets). */
  adjusted: number;
  /** carriedIn + allowance − spent − moved + adjusted. */
  remaining: number;
  entries: Entry[];
}

/**
 * Summaries for every period from the budget's first period through the current one, oldest first.
 * Each period's `remaining` becomes the next period's `carriedIn`.
 */
export function summaries(
  budget: Budget,
  rates: readonly BudgetRate[],
  entries: readonly Entry[],
  today: ISODate,
): PeriodSummary[] {
  const first = firstPeriod(budget);
  const current = currentPeriod(budget, today);
  if (current < first) return [];

  const buckets = new Map<ISODate, Entry[]>();
  let running = 0;
  for (const e of entries) {
    if (e.budgetId !== budget.id || e.deletedAt || e.date > today) continue;
    const p = periodStart(e.date, budget.period, budget.weekStartsOn);
    if (p < first) {
      running += entryEffect(e);
      continue;
    }
    const list = buckets.get(p);
    if (list) list.push(e);
    else buckets.set(p, [e]);
  }

  const segs = normalizedRates(budget, rates);
  let segIdx = -1;
  const out: PeriodSummary[] = [];
  for (let p = first; p <= current; p = nextPeriodStart(p, budget.period)) {
    while (segIdx + 1 < segs.length && segs[segIdx + 1].from <= p) segIdx++;
    const allowance = segIdx >= 0 ? segs[segIdx].cents : 0;
    const list = (buckets.get(p) ?? []).sort(compareEntries);
    let spent = 0;
    let moved = 0;
    let adjusted = 0;
    for (const e of list) {
      if (e.kind === 'spend') spent += e.amountCents;
      else if (e.kind === 'to_goal') moved += e.amountCents;
      else if (e.kind === 'from_goal') moved -= e.amountCents;
      else adjusted += e.amountCents;
    }
    const carriedIn = running;
    running = carriedIn + allowance - spent - moved + adjusted;
    out.push({ start: p, carriedIn, allowance, spent, moved, adjusted, remaining: running, entries: list });
  }
  return out;
}

/** Summary of the current period. `remaining` equals `balance(...)`. */
export function currentSummary(
  budget: Budget,
  rates: readonly BudgetRate[],
  entries: readonly Entry[],
  today: ISODate,
): PeriodSummary | undefined {
  const all = summaries(budget, rates, entries, today);
  return all[all.length - 1];
}

/** Newest first: by date, then creation time. */
export function compareEntries(a: Entry, b: Entry): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

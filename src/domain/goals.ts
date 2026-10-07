import { daysBetween, toISODate } from './period';
import type { Entry, Goal, ISODate } from './types';

/** Amount currently saved toward a goal: Σ to_goal − Σ from_goal across all budgets. */
export function goalSaved(goalId: string, entries: readonly Entry[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.goalId !== goalId || e.deletedAt) continue;
    if (e.kind === 'to_goal') total += e.amountCents;
    else if (e.kind === 'from_goal') total -= e.amountCents;
  }
  return total;
}

/** Only a positive balance (surplus) can be moved into a goal. */
export function maxMovable(budgetBalance: number): number {
  return Math.max(0, budgetBalance);
}

/** You can't withdraw more than the goal holds. */
export function maxWithdrawable(saved: number): number {
  return Math.max(0, saved);
}

/**
 * Rough days-to-target based on the goal's average daily contribution since it was created.
 * Returns null when there isn't enough signal (nothing saved, or created today).
 */
export function goalEtaDays(goal: Goal, saved: number, today: ISODate): number | null {
  const remaining = goal.targetCents - saved;
  if (remaining <= 0) return 0;
  const age = daysBetween(toISODate(new Date(goal.createdAt)), today);
  if (saved <= 0 || age < 1) return null;
  const perDay = saved / age;
  return Math.ceil(remaining / perDay);
}

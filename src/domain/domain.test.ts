import { describe, expect, it } from 'vitest';
import { accrued, balance, currentSummary, rateAt, summaries } from './ledger';
import { goalEtaDays, goalSaved, maxMovable, maxWithdrawable } from './goals';
import { centsToInput, parseCents } from './money';
import { periodEnd, periodStart, periodsBetween } from './period';
import type { Budget, BudgetRate, Entry, EntryKind, Period, WeekStart } from './types';

let seq = 0;
function budget(period: Period, startDate: string, weekStartsOn: WeekStart = 1): Budget {
  return { id: 'b1', name: 'Test', period, weekStartsOn, startDate, isDefault: true, createdAt: '2026-01-01T00:00:00Z' };
}
function rate(amountCents: number, effectiveFrom: string): BudgetRate {
  return { id: `r${++seq}`, budgetId: 'b1', amountCents, effectiveFrom };
}
function entry(kind: EntryKind, amountCents: number, date: string, extra: Partial<Entry> = {}): Entry {
  return {
    id: `e${++seq}`,
    budgetId: 'b1',
    kind,
    amountCents,
    date,
    createdAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
    ...extra,
  };
}

describe('money', () => {
  it('parses amounts to integer cents without floating point', () => {
    expect(parseCents('6')).toBe(600);
    expect(parseCents('6.5')).toBe(650);
    expect(parseCents('6.50')).toBe(650);
    expect(parseCents('.99')).toBe(99);
    expect(parseCents('0.1')).toBe(10);
    expect(parseCents('1,000.25')).toBe(100025);
    expect(parseCents('19.99')).toBe(1999); // 19.99 * 100 = 1998.9999… in floats
    expect(parseCents('')).toBeNull();
    expect(parseCents('.')).toBeNull();
    expect(parseCents('1.234')).toBeNull();
    expect(parseCents('-5')).toBeNull();
    expect(parseCents('abc')).toBeNull();
  });

  it('round-trips cents to input strings', () => {
    expect(centsToInput(600)).toBe('6');
    expect(centsToInput(650)).toBe('6.50');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(-150)).toBe('-1.50');
  });
});

describe('periods', () => {
  it('computes week starts for Monday vs Sunday weeks', () => {
    // 2026-10-07 is a Wednesday
    expect(periodStart('2026-10-07', 'week', 1)).toBe('2026-10-05');
    expect(periodStart('2026-10-07', 'week', 0)).toBe('2026-10-04');
    expect(periodStart('2026-10-04', 'week', 1)).toBe('2026-09-28'); // Sunday belongs to previous Mon-week
  });

  it('computes month and year boundaries', () => {
    expect(periodStart('2026-02-17', 'month', 1)).toBe('2026-02-01');
    expect(periodEnd('2026-02-01', 'month')).toBe('2026-02-28');
    expect(periodEnd('2028-02-01', 'month')).toBe('2028-02-29');
    expect(periodStart('2026-10-07', 'year', 1)).toBe('2026-01-01');
  });

  it('counts periods across DST changes', () => {
    expect(periodsBetween('2026-03-01', '2026-04-01', 'day')).toBe(31);
    expect(periodsBetween('2026-10-05', '2026-11-09', 'week')).toBe(5);
  });
});

describe('rollover', () => {
  it('spec example: $5/day, spend $6, next day starts at $4', () => {
    const b = budget('day', '2026-10-07');
    const rates = [rate(500, '2026-10-07')];
    const entries = [entry('spend', 600, '2026-10-07')];

    expect(balance(b, rates, entries, '2026-10-07')).toBe(-100);
    const next = currentSummary(b, rates, entries, '2026-10-08')!;
    expect(next.carriedIn).toBe(-100);
    expect(next.allowance).toBe(500);
    expect(next.remaining).toBe(400);
    expect(balance(b, rates, entries, '2026-10-08')).toBe(400);
  });

  it('catches up after the app is not opened for 10 days', () => {
    const b = budget('day', '2026-10-01');
    const rates = [rate(500, '2026-10-01')];
    const entries = [entry('spend', 300, '2026-10-01')];
    // Oct 1..Oct 11 = 11 days of allowance
    expect(balance(b, rates, entries, '2026-10-11')).toBe(11 * 500 - 300);
  });

  it('weekly budget respects the budget week start', () => {
    const mon = budget('week', '2026-10-05', 1);
    const sun = budget('week', '2026-10-05', 0);
    const rates = [rate(5000, '2026-10-05')];
    // Sunday Oct 11: still week 1 for Monday-weeks, but week 2 for Sunday-weeks
    // (Sunday-weeks: first period is Oct 4, and Oct 11 starts the second).
    expect(balance(mon, rates, [], '2026-10-11')).toBe(5000);
    expect(balance(sun, rates, [], '2026-10-11')).toBe(10000);
  });

  it('monthly budget gives a fixed amount regardless of month length', () => {
    const b = budget('month', '2026-01-15');
    const rates = [rate(30000, '2026-01-15')];
    // Jan (31), Feb (28), Mar (31), Apr (30) -> 4 months, first period full (no proration)
    expect(balance(b, rates, [], '2026-04-30')).toBe(4 * 30000);
    expect(currentSummary(b, rates, [], '2026-02-28')!.start).toBe('2026-02-01');
  });

  it('yearly budget accrues once per calendar year', () => {
    const b = budget('year', '2025-06-01');
    const rates = [rate(120000, '2025-06-01')];
    expect(balance(b, rates, [], '2026-10-07')).toBe(240000);
  });

  it('rate changes apply from their period onward without rewriting history', () => {
    const b = budget('day', '2026-10-01');
    const rates = [rate(500, '2026-10-01'), rate(1000, '2026-10-04')];
    expect(rateAt(b, rates, '2026-10-03')).toBe(500);
    expect(rateAt(b, rates, '2026-10-04')).toBe(1000);
    // Oct 1-3 at $5, Oct 4-6 at $10
    expect(accrued(b, rates, '2026-10-06')).toBe(3 * 500 + 3 * 1000);
    const hist = summaries(b, rates, [], '2026-10-06');
    expect(hist.map((s) => s.allowance)).toEqual([500, 500, 500, 1000, 1000, 1000]);
  });

  it('a later rate with the same effectiveFrom replaces the earlier one', () => {
    const b = budget('day', '2026-10-01');
    const rates = [rate(500, '2026-10-01'), rate(700, '2026-10-01')];
    expect(accrued(b, rates, '2026-10-02')).toBe(1400);
  });

  it('a budget starting in the future has no balance yet', () => {
    const b = budget('day', '2026-10-10');
    const rates = [rate(500, '2026-10-10')];
    expect(balance(b, rates, [], '2026-10-07')).toBe(0);
    expect(summaries(b, rates, [], '2026-10-07')).toEqual([]);
  });

  it('backdated spends change history but not the total', () => {
    const b = budget('day', '2026-10-01');
    const rates = [rate(500, '2026-10-01')];
    const today = '2026-10-05';
    const loggedToday = [entry('spend', 800, today)];
    const backdated = [entry('spend', 800, '2026-10-02')];
    expect(balance(b, rates, loggedToday, today)).toBe(balance(b, rates, backdated, today));

    const hist = summaries(b, rates, backdated, today);
    expect(hist[1].spent).toBe(800);
    expect(hist[1].remaining).toBe(500 + 500 - 800);
    expect(hist[hist.length - 1].spent).toBe(0);
  });

  it('current summary remaining always equals balance', () => {
    const b = budget('week', '2026-09-01', 1);
    const rates = [rate(3500, '2026-09-01'), rate(4000, '2026-09-21')];
    const entries = [
      entry('spend', 1234, '2026-09-02'),
      entry('spend', 5000, '2026-09-15'),
      entry('to_goal', 1000, '2026-09-30', { goalId: 'g1' }),
      entry('from_goal', 250, '2026-10-01', { goalId: 'g1' }),
      entry('adjust', 700, '2026-10-06'),
      entry('spend', 999, '2026-10-06', { deletedAt: '2026-10-06T10:00:00Z' }),
    ];
    for (const today of ['2026-09-01', '2026-09-20', '2026-10-01', '2026-10-07']) {
      expect(currentSummary(b, rates, entries, today)!.remaining).toBe(balance(b, rates, entries, today));
    }
  });

  it('ignores deleted entries and other budgets', () => {
    const b = budget('day', '2026-10-07');
    const rates = [rate(500, '2026-10-07')];
    const entries = [
      entry('spend', 300, '2026-10-07', { deletedAt: '2026-10-07T12:00:00Z' }),
      entry('spend', 300, '2026-10-07', { budgetId: 'other' }),
    ];
    expect(balance(b, rates, entries, '2026-10-07')).toBe(500);
  });

  it('reset balance is an adjustment of −balance', () => {
    const b = budget('day', '2026-10-01');
    const rates = [rate(500, '2026-10-01')];
    const entries = [entry('spend', 20000, '2026-10-01')];
    const today = '2026-10-03';
    const before = balance(b, rates, entries, today);
    expect(before).toBe(1500 - 20000);
    entries.push(entry('adjust', -before, today));
    expect(balance(b, rates, entries, today)).toBe(0);
    // and the next day starts fresh with just the allowance
    expect(balance(b, rates, entries, '2026-10-04')).toBe(500);
  });
});

describe('goals', () => {
  it('moves to and from goals affect the budget and goal symmetrically', () => {
    const b = budget('day', '2026-10-01');
    const rates = [rate(500, '2026-10-01')];
    const today = '2026-10-04'; // $20 accrued
    const entries = [
      entry('to_goal', 1500, today, { goalId: 'iphone' }),
      entry('from_goal', 500, today, { goalId: 'iphone' }),
      entry('to_goal', 100, today, { goalId: 'other' }),
    ];
    expect(goalSaved('iphone', entries)).toBe(1000);
    expect(balance(b, rates, entries, today)).toBe(2000 - 1500 + 500 - 100);
    const s = currentSummary(b, rates, entries, today)!;
    expect(s.moved).toBe(1100);
  });

  it('only a positive balance can be moved', () => {
    expect(maxMovable(2000)).toBe(2000);
    expect(maxMovable(0)).toBe(0);
    expect(maxMovable(-100)).toBe(0);
  });

  it('withdrawals are capped at what the goal holds', () => {
    expect(maxWithdrawable(1000)).toBe(1000);
    expect(maxWithdrawable(-5)).toBe(0);
  });

  it('estimates time to target from average contribution', () => {
    const goal = { id: 'g', name: 'iPhone', targetCents: 100000, createdAt: new Date(2026, 9, 1).toISOString() };
    // $100 saved over 10 days => $10/day, $900 to go => 90 days
    expect(goalEtaDays(goal, 10000, '2026-10-11')).toBe(90);
    expect(goalEtaDays(goal, 0, '2026-10-11')).toBeNull();
    expect(goalEtaDays(goal, 100000, '2026-10-11')).toBe(0);
  });
});

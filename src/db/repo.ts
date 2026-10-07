import { balance } from '../domain/ledger';
import { goalSaved, maxMovable, maxWithdrawable } from '../domain/goals';
import { periodStart } from '../domain/period';
import type { Budget, BudgetRate, Entry, EntryKind, Goal, ISODate, Period, WeekStart } from '../domain/types';
import { db } from './schema';

/** All writes go through here. Every action validates against freshly-read data inside a transaction. */

export class RepoError extends Error {}

const uid = () => crypto.randomUUID();
const nowStamp = () => new Date().toISOString();

async function loadBudget(id: string): Promise<{ budget: Budget; rates: BudgetRate[]; entries: Entry[] }> {
  const budget = await db.budgets.get(id);
  if (!budget) throw new RepoError('Budget not found');
  const [rates, entries] = await Promise.all([
    db.rates.where('budgetId').equals(id).toArray(),
    db.entries.where('budgetId').equals(id).toArray(),
  ]);
  return { budget, rates, entries };
}

function assertAmount(cents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new RepoError('Enter an amount greater than zero');
}

function assertDate(date: ISODate, budget: Budget, today: ISODate) {
  if (date > today) throw new RepoError('Can’t log in the future');
  if (date < budget.startDate) throw new RepoError('That date is before this budget started');
}

// ---------- Budgets ----------

export async function createBudget(input: {
  name: string;
  period: Period;
  amountCents: number;
  weekStartsOn: WeekStart;
  startDate: ISODate;
}): Promise<string> {
  assertAmount(input.amountCents);
  const name = input.name.trim() || 'Budget';
  const id = uid();
  await db.transaction('rw', db.budgets, db.rates, async () => {
    const hasDefault = (await db.budgets.filter((b) => b.isDefault && !b.archivedAt).count()) > 0;
    await db.budgets.add({
      id,
      name,
      period: input.period,
      weekStartsOn: input.weekStartsOn,
      startDate: input.startDate,
      isDefault: !hasDefault,
      createdAt: nowStamp(),
    });
    await db.rates.add({
      id: uid(),
      budgetId: id,
      amountCents: input.amountCents,
      effectiveFrom: periodStart(input.startDate, input.period, input.weekStartsOn),
    });
  });
  return id;
}

/** Change the allowance from the current period onward. Past periods keep their old allowance. */
export async function setRate(budgetId: string, amountCents: number, today: ISODate) {
  assertAmount(amountCents);
  await db.transaction('rw', db.budgets, db.rates, async () => {
    const budget = await db.budgets.get(budgetId);
    if (!budget) throw new RepoError('Budget not found');
    const day = today < budget.startDate ? budget.startDate : today;
    const effectiveFrom = periodStart(day, budget.period, budget.weekStartsOn);
    await db.rates.where('budgetId').equals(budgetId).filter((r) => r.effectiveFrom === effectiveFrom).delete();
    await db.rates.add({ id: uid(), budgetId, amountCents, effectiveFrom });
  });
}

export async function renameBudget(budgetId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new RepoError('Name can’t be empty');
  await db.budgets.update(budgetId, { name: trimmed });
}

export async function setDefaultBudget(budgetId: string) {
  await db.transaction('rw', db.budgets, async () => {
    await db.budgets.toCollection().modify((b) => {
      b.isDefault = b.id === budgetId;
    });
  });
}

export async function archiveBudget(budgetId: string) {
  await db.transaction('rw', db.budgets, async () => {
    const budget = await db.budgets.get(budgetId);
    if (!budget) return;
    await db.budgets.update(budgetId, { archivedAt: nowStamp(), isDefault: false });
    if (budget.isDefault) {
      const next = await db.budgets.filter((b) => !b.archivedAt).first();
      if (next) await db.budgets.update(next.id, { isDefault: true });
    }
  });
}

/** Zero out the balance with a visible adjustment entry. */
export async function resetBalance(budgetId: string, today: ISODate) {
  await db.transaction('rw', db.budgets, db.rates, db.entries, async () => {
    const { budget, rates, entries } = await loadBudget(budgetId);
    const bal = balance(budget, rates, entries, today);
    if (bal === 0) return;
    await db.entries.add({
      id: uid(),
      budgetId,
      kind: 'adjust',
      amountCents: -bal,
      date: today < budget.startDate ? budget.startDate : today,
      note: 'Balance reset',
      createdAt: nowStamp(),
    });
  });
}

// ---------- Entries ----------

export async function logSpend(input: {
  budgetId: string;
  amountCents: number;
  date: ISODate;
  note?: string;
  today: ISODate;
}): Promise<string> {
  assertAmount(input.amountCents);
  const id = uid();
  await db.transaction('rw', db.budgets, db.entries, async () => {
    const budget = await db.budgets.get(input.budgetId);
    if (!budget) throw new RepoError('Budget not found');
    assertDate(input.date, budget, input.today);
    await db.entries.add({
      id,
      budgetId: input.budgetId,
      kind: 'spend',
      amountCents: input.amountCents,
      date: input.date,
      note: input.note?.trim() || undefined,
      createdAt: nowStamp(),
    });
  });
  return id;
}

export async function updateSpend(
  entryId: string,
  patch: { amountCents: number; date: ISODate; note?: string },
  today: ISODate,
) {
  assertAmount(patch.amountCents);
  await db.transaction('rw', db.budgets, db.entries, async () => {
    const e = await db.entries.get(entryId);
    if (!e) throw new RepoError('Entry not found');
    if (e.kind !== 'spend') throw new RepoError('Only spends can be edited');
    const budget = await db.budgets.get(e.budgetId);
    if (!budget) throw new RepoError('Budget not found');
    assertDate(patch.date, budget, today);
    await db.entries.update(entryId, {
      amountCents: patch.amountCents,
      date: patch.date,
      note: patch.note?.trim() || undefined,
    });
  });
}

/** Soft delete so it can be undone. */
export async function deleteEntry(entryId: string) {
  await db.transaction('rw', db.entries, async () => {
    const e = await db.entries.get(entryId);
    if (!e || e.deletedAt) return;
    if (e.kind === 'to_goal' && e.goalId) {
      const goalEntries = await db.entries.where('goalId').equals(e.goalId).toArray();
      if (goalSaved(e.goalId, goalEntries) - e.amountCents < 0) {
        throw new RepoError('That money was already withdrawn from the goal');
      }
    }
    await db.entries.update(entryId, { deletedAt: nowStamp() });
  });
}

export async function restoreEntry(entryId: string) {
  await db.entries.update(entryId, { deletedAt: undefined });
}

// ---------- Goals ----------

export async function createGoal(name: string, targetCents: number): Promise<string> {
  assertAmount(targetCents);
  const trimmed = name.trim();
  if (!trimmed) throw new RepoError('Give your goal a name');
  const id = uid();
  await db.goals.add({ id, name: trimmed, targetCents, createdAt: nowStamp() });
  return id;
}

export async function updateGoal(goalId: string, patch: Partial<Pick<Goal, 'name' | 'targetCents'>>) {
  if (patch.targetCents !== undefined) assertAmount(patch.targetCents);
  if (patch.name !== undefined && !patch.name.trim()) throw new RepoError('Give your goal a name');
  await db.goals.update(goalId, { ...patch, name: patch.name?.trim() });
}

export async function setGoalAchieved(goalId: string, achieved: boolean) {
  await db.goals.update(goalId, { achievedAt: achieved ? nowStamp() : undefined });
}

export async function archiveGoal(goalId: string) {
  await db.goals.update(goalId, { archivedAt: nowStamp() });
}

async function addGoalEntry(kind: EntryKind, input: GoalMoveInput) {
  await db.entries.add({
    id: uid(),
    budgetId: input.budgetId,
    kind,
    amountCents: input.amountCents,
    date: input.today,
    goalId: input.goalId,
    note: input.note?.trim() || undefined,
    createdAt: nowStamp(),
  });
}

interface GoalMoveInput {
  budgetId: string;
  goalId: string;
  amountCents: number;
  today: ISODate;
  note?: string;
}

/** Move surplus from a budget into a goal. Capped at the budget's positive balance. */
export async function moveToGoal(input: GoalMoveInput) {
  assertAmount(input.amountCents);
  await db.transaction('rw', [db.budgets, db.rates, db.entries, db.goals], async () => {
    if (!(await db.goals.get(input.goalId))) throw new RepoError('Goal not found');
    const { budget, rates, entries } = await loadBudget(input.budgetId);
    const max = maxMovable(balance(budget, rates, entries, input.today));
    if (input.amountCents > max) throw new RepoError('You can only move money you haven’t spent');
    await addGoalEntry('to_goal', input);
  });
}

/** Move money back out of a goal into a budget. Capped at what the goal holds. */
export async function withdrawFromGoal(input: GoalMoveInput) {
  assertAmount(input.amountCents);
  await db.transaction('rw', [db.budgets, db.entries, db.goals], async () => {
    if (!(await db.goals.get(input.goalId))) throw new RepoError('Goal not found');
    if (!(await db.budgets.get(input.budgetId))) throw new RepoError('Budget not found');
    const goalEntries = await db.entries.where('goalId').equals(input.goalId).toArray();
    const max = maxWithdrawable(goalSaved(input.goalId, goalEntries));
    if (input.amountCents > max) throw new RepoError('That’s more than this goal holds');
    await addGoalEntry('from_goal', input);
  });
}

// ---------- Meta ----------

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

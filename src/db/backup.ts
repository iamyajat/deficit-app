import { db, type MetaRow } from './schema';
import type { Budget, BudgetRate, Entry, Goal } from '../domain/types';

export interface BackupFile {
  app: 'deficit';
  version: 1;
  exportedAt: string;
  budgets: Budget[];
  rates: BudgetRate[];
  entries: Entry[];
  goals: Goal[];
  meta: MetaRow[];
}

export async function exportBackup(): Promise<BackupFile> {
  const [budgets, rates, entries, goals, meta] = await Promise.all([
    db.budgets.toArray(),
    db.rates.toArray(),
    db.entries.toArray(),
    db.goals.toArray(),
    db.meta.toArray(),
  ]);
  return { app: 'deficit', version: 1, exportedAt: new Date().toISOString(), budgets, rates, entries, goals, meta };
}

function isBackup(x: unknown): x is BackupFile {
  if (!x || typeof x !== 'object') return false;
  const b = x as Record<string, unknown>;
  return (
    b.app === 'deficit' &&
    b.version === 1 &&
    ['budgets', 'rates', 'entries', 'goals', 'meta'].every((k) => Array.isArray(b[k]))
  );
}

/** Replace all local data with the contents of a backup file. */
export async function importBackup(text: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t valid JSON');
  }
  if (!isBackup(parsed)) throw new Error('That doesn’t look like a Deficit backup');
  const data = parsed;
  await db.transaction('rw', [db.budgets, db.rates, db.entries, db.goals, db.meta], async () => {
    await Promise.all([db.budgets.clear(), db.rates.clear(), db.entries.clear(), db.goals.clear(), db.meta.clear()]);
    await db.budgets.bulkAdd(data.budgets);
    await db.rates.bulkAdd(data.rates);
    await db.entries.bulkAdd(data.entries);
    await db.goals.bulkAdd(data.goals);
    await db.meta.bulkAdd(data.meta);
  });
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportCsv(): Promise<string> {
  const [budgets, goals, entries] = await Promise.all([db.budgets.toArray(), db.goals.toArray(), db.entries.toArray()]);
  const budgetName = new Map(budgets.map((b) => [b.id, b.name]));
  const goalName = new Map(goals.map((g) => [g.id, g.name]));
  const rows = entries
    .filter((e) => !e.deletedAt)
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)))
    .map((e) =>
      [
        e.date,
        budgetName.get(e.budgetId) ?? '',
        e.kind,
        (e.amountCents / 100).toFixed(2),
        e.goalId ? goalName.get(e.goalId) ?? '' : '',
        e.note ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  return ['date,budget,kind,amount,goal,note', ...rows].join('\n');
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

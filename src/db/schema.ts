import Dexie, { type Table } from 'dexie';
import type { Budget, BudgetRate, Entry, Goal } from '../domain/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

export class DeficitDB extends Dexie {
  budgets!: Table<Budget, string>;
  rates!: Table<BudgetRate, string>;
  entries!: Table<Entry, string>;
  goals!: Table<Goal, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('deficit');
    this.version(1).stores({
      budgets: 'id',
      rates: 'id, budgetId',
      entries: 'id, budgetId, [budgetId+date], goalId, date',
      goals: 'id',
      meta: 'key',
    });
  }
}

export const db = new DeficitDB();

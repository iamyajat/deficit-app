/** Local calendar date, `YYYY-MM-DD`. Lexicographic order == chronological order. */
export type ISODate = string;

export type Period = 'day' | 'week' | 'month' | 'year';

/** 0 = Sunday, 1 = Monday. */
export type WeekStart = 0 | 1;

export interface Budget {
  id: string;
  name: string;
  period: Period;
  weekStartsOn: WeekStart;
  startDate: ISODate;
  isDefault: boolean;
  createdAt: string;
  archivedAt?: string;
}

export interface BudgetRate {
  id: string;
  budgetId: string;
  amountCents: number;
  /** Start date of the first period this rate applies to. */
  effectiveFrom: ISODate;
}

export type EntryKind = 'spend' | 'to_goal' | 'from_goal' | 'adjust';

export interface Entry {
  id: string;
  budgetId: string;
  kind: EntryKind;
  /** Positive for spend / to_goal / from_goal. Signed for adjust. */
  amountCents: number;
  date: ISODate;
  goalId?: string;
  note?: string;
  createdAt: string;
  deletedAt?: string;
}

export interface Goal {
  id: string;
  name: string;
  targetCents: number;
  createdAt: string;
  achievedAt?: string;
  archivedAt?: string;
}

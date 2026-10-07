import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { balance } from '../domain/ledger';
import { formatCents } from '../domain/money';
import { isValidISODate, todayISO } from '../domain/period';
import type { Budget, BudgetRate, Entry, Goal, ISODate } from '../domain/types';

export interface AppData {
  budgets: Budget[];
  rates: BudgetRate[];
  entries: Entry[];
  goals: Goal[];
  currency: string;
  lastBackupAt?: string;
}

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  tone?: 'error';
}

interface AppState {
  data: AppData;
  today: ISODate;
  fmt: (cents: number, opts?: { signed?: boolean }) => string;
  activeBudgets: Budget[];
  selectedBudget?: Budget;
  selectBudget: (id: string) => void;
  balanceOf: (budget: Budget) => number;
  toast: (message: string, opts?: { action?: Toast['action']; tone?: 'error' }) => void;
  /** Run an async action, surfacing any error as a toast. Resolves true on success. */
  attempt: (fn: () => Promise<unknown>) => Promise<boolean>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

/** Local "today", refreshed at midnight and when the app comes back to the foreground. */
function useToday(): ISODate {
  const override = useMemo(() => {
    if (!import.meta.env.DEV) return null;
    const q = new URLSearchParams(location.search).get('today');
    return q && isValidISODate(q) ? q : null;
  }, []);
  const [today, setToday] = useState(() => override ?? todayISO());
  useEffect(() => {
    if (override) return;
    const refresh = () => setToday(todayISO());
    const now = new Date();
    const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const t = setTimeout(refresh, msToMidnight + 500);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [today, override]);
  return today;
}

const SELECTED_KEY = 'deficit.selectedBudget';

function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function AppProvider({ children, toastHost }: { children: ReactNode; toastHost: (t: Toast | null, dismiss: () => void) => ReactNode }) {
  const today = useToday();
  const data = useLiveQuery(async (): Promise<AppData> => {
    const [budgets, rates, entries, goals, currencyRow, backupRow] = await Promise.all([
      db.budgets.toArray(),
      db.rates.toArray(),
      db.entries.toArray(),
      db.goals.toArray(),
      db.meta.get('currency'),
      db.meta.get('lastBackupAt'),
    ]);
    return {
      budgets,
      rates,
      entries,
      goals,
      currency: (currencyRow?.value as string) ?? defaultCurrency(),
      lastBackupAt: backupRow?.value as string | undefined,
    };
  }, []);

  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  const selectBudget = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* storage unavailable; selection just won't persist */
    }
  }, []);

  const [toastState, setToastState] = useState<Toast | null>(null);
  const toastSeq = useRef(0);
  const toast = useCallback<AppState['toast']>((message, opts) => {
    const id = ++toastSeq.current;
    setToastState({ id, message, ...opts });
    setTimeout(() => setToastState((t) => (t?.id === id ? null : t)), opts?.action ? 5000 : 3000);
  }, []);
  const attempt = useCallback<AppState['attempt']>(
    async (fn) => {
      try {
        await fn();
        return true;
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Something went wrong', { tone: 'error' });
        return false;
      }
    },
    [toast],
  );

  const value = useMemo<AppState | null>(() => {
    if (!data) return null;
    const activeBudgets = data.budgets
      .filter((b) => !b.archivedAt)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.localeCompare(b.createdAt));
    const selectedBudget = activeBudgets.find((b) => b.id === selectedId) ?? activeBudgets[0];
    return {
      data,
      today,
      fmt: (cents, opts) => formatCents(cents, data.currency, opts),
      activeBudgets,
      selectedBudget,
      selectBudget,
      balanceOf: (b) => balance(b, data.rates, data.entries, today),
      toast,
      attempt,
    };
  }, [data, today, selectedId, selectBudget, toast, attempt]);

  if (!value) return null;
  return (
    <Ctx.Provider value={value}>
      {children}
      {toastHost(toastState, () => setToastState(null))}
    </Ctx.Provider>
  );
}

function defaultCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const byRegion: Record<string, string> = {
      US: 'USD', GB: 'GBP', IN: 'INR', CA: 'CAD', AU: 'AUD', NZ: 'NZD', SG: 'SGD', CH: 'CHF',
      DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', PT: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR',
    };
    return (region && byRegion[region]) || 'USD';
  } catch {
    return 'USD';
  }
}

export type { Toast };

import { useCallback, useMemo, useState } from 'react';
import { deleteEntry, logSpend } from '../../db/repo';
import { currentSummary } from '../../domain/ledger';
import { maxMovable } from '../../domain/goals';
import { parseCents } from '../../domain/money';
import { currentPeriodLabel, daysBetween, parseISODate } from '../../domain/period';
import type { Entry } from '../../domain/types';
import { BalanceCard } from '../components/BalanceCard';
import { BudgetForm } from '../components/BudgetForm';
import { BudgetSwitcher } from '../components/BudgetSwitcher';
import { EditSpendSheet } from '../components/EditSpendSheet';
import { EntryRow } from '../components/EntryRow';
import { Keypad } from '../components/Keypad';
import { MoveSheet } from '../components/MoveSheet';
import { useApp } from '../state';

export function Home({ active }: { active: boolean }) {
  const { activeBudgets, selectedBudget, data, today, fmt, attempt, toast, balanceOf } = useApp();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState<string | null>(null); // null = today
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);

  const summary = useMemo(
    () => selectedBudget && currentSummary(selectedBudget, data.rates, data.entries, today),
    [selectedBudget, data.rates, data.entries, today],
  );
  const cents = parseCents(amount);
  const canLog = !!selectedBudget && cents !== null && cents > 0;

  const submit = useCallback(async () => {
    if (!selectedBudget || !cents) return;
    let id = '';
    const ok = await attempt(async () => {
      id = await logSpend({ budgetId: selectedBudget.id, amountCents: cents, date: date ?? today, note, today });
    });
    if (ok) {
      setAmount('');
      setNote('');
      setDate(null);
      toast(`Logged ${fmt(cents)}`, { action: { label: 'Undo', run: () => void deleteEntry(id) } });
    }
  }, [selectedBudget, cents, date, today, note, attempt, toast, fmt]);

  if (activeBudgets.length === 0 || !selectedBudget) {
    return (
      <div className="screen">
        <header className="welcome">
          <h1>Deficit</h1>
          <p className="muted">
            Set a budget. Log what you spend. Whatever you don’t use rolls into the next period — and so does whatever you
            overspend.
          </p>
        </header>
        <section className="card">
          <BudgetForm submitLabel="Start budgeting" />
        </section>
      </div>
    );
  }

  const bal = balanceOf(selectedBudget);
  const hasGoals = data.goals.some((g) => !g.archivedAt);
  const recent = summary?.entries.slice(0, 8) ?? [];
  const logDate = date ?? today;
  const backupStale =
    data.entries.length > 20 && (!data.lastBackupAt || daysBetween(data.lastBackupAt.slice(0, 10), today) > 30);

  return (
    <div className="screen home">
      <BudgetSwitcher />
      <BalanceCard budget={selectedBudget} summary={summary} />

      {maxMovable(bal) > 0 && hasGoals && (
        <button className="btn ghost move-btn" onClick={() => setMoving(true)}>
          Move {fmt(bal)} surplus to a goal →
        </button>
      )}

      <section className="logger">
        <div className={`amount-display ${amount ? '' : 'placeholder'}`} aria-live="polite">
          {amount ? fmt(cents ?? 0) : fmt(0)}
        </div>
        <div className="log-meta">
          <label className="date-chip">
            <span>{logDate === today ? 'Today' : daysBetween(logDate, today) === 1 ? 'Yesterday' : shortDate(logDate)}</span>
            <input
              type="date"
              value={logDate}
              max={today}
              min={selectedBudget.startDate}
              onChange={(e) => setDate(e.target.value && e.target.value !== today ? e.target.value : null)}
              aria-label="Date of spend"
            />
          </label>
          <input
            className="note-input"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>
        <Keypad value={amount} onChange={setAmount} onSubmit={() => void submit()} captureKeys={active && !moving && !editing} />
        <button className="btn primary log-btn" disabled={!canLog} onClick={() => void submit()}>
          Log spend
        </button>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="section-title">{currentPeriodLabel(selectedBudget.period)}</h2>
          <ul className="entry-list">
            {recent.map((e) => (
              <EntryRow key={e.id} entry={e} showDate={selectedBudget.period !== 'day'} onEdit={setEditing} />
            ))}
          </ul>
        </section>
      )}

      {backupStale && (
        <a className="nudge" href="#settings">
          Your data only lives on this device. Export a backup →
        </a>
      )}

      {moving && <MoveSheet direction="in" budgetId={selectedBudget.id} onClose={() => setMoving(false)} />}
      {editing && <EditSpendSheet entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function shortDate(d: string) {
  return parseISODate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

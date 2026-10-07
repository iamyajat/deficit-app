import { useState } from 'react';
import { createBudget } from '../../db/repo';
import { parseCents } from '../../domain/money';
import { periodAdjective } from '../../domain/period';
import type { Period, WeekStart } from '../../domain/types';
import { useApp } from '../state';

const PERIODS: Period[] = ['day', 'week', 'month', 'year'];

export function BudgetForm({ onDone, submitLabel = 'Create budget' }: { onDone?: (id: string) => void; submitLabel?: string }) {
  const { today, attempt, selectBudget } = useApp();
  const [name, setName] = useState('');
  const [period, setPeriod] = useState<Period>('day');
  const [amount, setAmount] = useState('');
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStart>(1);
  const [startDate, setStartDate] = useState(today);
  const cents = parseCents(amount);

  const submit = async () => {
    if (!cents) return;
    let id = '';
    const ok = await attempt(async () => {
      id = await createBudget({ name: name || defaultName(period), period, amountCents: cents, weekStartsOn, startDate });
    });
    if (ok) {
      selectBudget(id);
      onDone?.(id);
    }
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="segmented" role="radiogroup" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            type="button"
            key={p}
            role="radio"
            aria-checked={period === p}
            className={period === p ? 'active' : ''}
            onClick={() => setPeriod(p)}
          >
            {periodAdjective(p)}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Amount per {period}</span>
        <input inputMode="decimal" placeholder="5.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label className="field">
        <span>Name</span>
        <input placeholder={defaultName(period)} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {period === 'week' && (
        <label className="field">
          <span>Week starts on</span>
          <select value={weekStartsOn} onChange={(e) => setWeekStartsOn(Number(e.target.value) as WeekStart)}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </label>
      )}
      <label className="field">
        <span>Starts</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value || today)} />
      </label>
      <button className="btn primary" type="submit" disabled={!cents}>
        {submitLabel}
      </button>
    </form>
  );
}

function defaultName(p: Period) {
  return `${periodAdjective(p).replace(/^\w/, (c) => c.toUpperCase())} budget`;
}

import { useState } from 'react';
import { updateSpend } from '../../db/repo';
import { centsToInput, parseCents } from '../../domain/money';
import type { Entry } from '../../domain/types';
import { useApp } from '../state';
import { Sheet } from './Sheet';

export function EditSpendSheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const { today, attempt, data } = useApp();
  const budget = data.budgets.find((b) => b.id === entry.budgetId);
  const [amount, setAmount] = useState(centsToInput(entry.amountCents));
  const [date, setDate] = useState(entry.date);
  const [note, setNote] = useState(entry.note ?? '');
  const cents = parseCents(amount);

  const save = async () => {
    if (!cents) return;
    if (await attempt(() => updateSpend(entry.id, { amountCents: cents, date, note }, today))) onClose();
  };

  return (
    <Sheet title="Edit spend" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span>Amount</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} min={budget?.startDate} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>
        <button className="btn primary" type="submit" disabled={!cents}>
          Save
        </button>
      </form>
    </Sheet>
  );
}

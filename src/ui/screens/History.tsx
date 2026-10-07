import { useMemo, useState } from 'react';
import { summaries } from '../../domain/ledger';
import { formatPeriod } from '../../domain/period';
import type { Entry } from '../../domain/types';
import { BudgetSwitcher } from '../components/BudgetSwitcher';
import { EditSpendSheet } from '../components/EditSpendSheet';
import { EntryRow } from '../components/EntryRow';
import { useApp } from '../state';

const PAGE = 30;

export function History() {
  const { selectedBudget, data, today, fmt } = useApp();
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);

  const all = useMemo(
    () => (selectedBudget ? summaries(selectedBudget, data.rates, data.entries, today).reverse() : []),
    [selectedBudget, data.rates, data.entries, today],
  );

  if (!selectedBudget) return <div className="screen"><p className="muted">No budget yet.</p></div>;

  return (
    <div className="screen">
      <h1>History</h1>
      <BudgetSwitcher />
      {all.length === 0 && <p className="muted">Nothing yet — this budget hasn’t started.</p>}
      <ul className="period-list">
        {all.slice(0, limit).map((s, i) => {
          const isOpen = open === s.start || (open === null && i === 0);
          return (
            <li key={s.start} className="card period-card">
              <button className="period-head" onClick={() => setOpen(isOpen ? '' : s.start)} aria-expanded={isOpen}>
                <span className="period-name">
                  {formatPeriod(s.start, selectedBudget.period)}
                  {i === 0 && <span className="badge">now</span>}
                </span>
                <span className={`period-end ${s.remaining < 0 ? 'neg' : 'pos'}`}>{fmt(s.remaining, { signed: true })}</span>
              </button>
              <div className="period-stats muted">
                <span>in {fmt(s.carriedIn + s.allowance)}</span>
                <span>spent {fmt(s.spent)}</span>
                {s.moved !== 0 && <span>goals {fmt(s.moved)}</span>}
                {s.adjusted !== 0 && <span>adj {fmt(s.adjusted, { signed: true })}</span>}
              </div>
              {isOpen &&
                (s.entries.length ? (
                  <ul className="entry-list">
                    {s.entries.map((e) => (
                      <EntryRow key={e.id} entry={e} showDate={selectedBudget.period !== 'day'} onEdit={setEditing} />
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">No entries.</p>
                ))}
            </li>
          );
        })}
      </ul>
      {all.length > limit && (
        <button className="btn ghost" onClick={() => setLimit(limit + PAGE)}>
          Show more
        </button>
      )}
      {editing && <EditSpendSheet entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

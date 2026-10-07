import { useEffect, useRef, useState } from 'react';
import { downloadText, exportBackup, exportCsv, importBackup } from '../../db/backup';
import { archiveBudget, renameBudget, resetBalance, setDefaultBudget, setMeta, setRate } from '../../db/repo';
import { currentPeriod, rateAt } from '../../domain/ledger';
import { centsToInput, parseCents } from '../../domain/money';
import { daysBetween, periodAdjective } from '../../domain/period';
import type { Budget } from '../../domain/types';
import { BudgetForm } from '../components/BudgetForm';
import { Sheet } from '../components/Sheet';
import { useApp } from '../state';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'NZD', 'SGD', 'CHF', 'AED', 'ZAR', 'BRL', 'MXN'];

export function Settings() {
  const { activeBudgets, data, fmt, balanceOf, today, attempt, toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currencies = CURRENCIES.includes(data.currency) ? CURRENCIES : [data.currency, ...CURRENCIES];

  const doExport = async () => {
    const backup = await exportBackup();
    downloadText(`deficit-backup-${today}.json`, JSON.stringify(backup, null, 2), 'application/json');
    await setMeta('lastBackupAt', new Date().toISOString());
    toast('Backup exported');
  };

  const doImport = async (file: File) => {
    if (!confirm('Importing replaces ALL data on this device with the backup. Continue?')) return;
    const text = await file.text();
    if (await attempt(() => importBackup(text))) toast('Backup restored');
  };

  return (
    <div className="screen">
      <h1>Settings</h1>

      <section className="card stack">
        <div className="screen-head">
          <h2>Budgets</h2>
          <button className="btn small" onClick={() => setAdding(true)}>
            + New
          </button>
        </div>
        <ul className="budget-list">
          {activeBudgets.map((b) => (
            <li key={b.id}>
              <button className="budget-row" onClick={() => setEditing(b)}>
                <span>
                  <strong>{b.name}</strong>
                  {b.isDefault && <span className="badge">default</span>}
                  <span className="muted small block">
                    {fmt(rateAt(b, data.rates, currentPeriod(b, today)))} {periodAdjective(b.period)}
                  </span>
                </span>
                <span className={balanceOf(b) < 0 ? 'neg' : 'pos'}>{fmt(balanceOf(b))}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <h2>Currency</h2>
        <select value={data.currency} onChange={(e) => void setMeta('currency', e.target.value)} aria-label="Currency">
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </section>

      <section className="card stack">
        <h2>Your data</h2>
        <p className="muted small">
          Everything is stored only on this device. Export a backup now and then — clearing your browser data or
          uninstalling the app deletes it.
          {data.lastBackupAt && ` Last backup ${daysAgo(daysBetween(data.lastBackupAt.slice(0, 10), today))}.`}
        </p>
        <div className="row wrap">
          <button className="btn" onClick={() => void attempt(doExport)}>
            Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <button
            className="btn"
            onClick={() => void attempt(async () => downloadText(`deficit-${today}.csv`, await exportCsv(), 'text/csv'))}
          >
            Export CSV
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void doImport(f);
          }}
        />
        <StorageStatus />
      </section>

      <InstallCard />

      {adding && (
        <Sheet title="New budget" onClose={() => setAdding(false)}>
          <BudgetForm onDone={() => setAdding(false)} />
        </Sheet>
      )}
      {editing && <BudgetEditor budget={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BudgetEditor({ budget, onClose }: { budget: Budget; onClose: () => void }) {
  const { data, today, fmt, balanceOf, attempt, toast } = useApp();
  const current = rateAt(budget, data.rates, currentPeriod(budget, today));
  const [name, setName] = useState(budget.name);
  const [amount, setAmount] = useState(centsToInput(current));
  const cents = parseCents(amount);
  const bal = balanceOf(budget);

  const save = async () => {
    const ok = await attempt(async () => {
      if (name.trim() !== budget.name) await renameBudget(budget.id, name);
      if (cents && cents !== current) await setRate(budget.id, cents, today);
    });
    if (ok) onClose();
  };

  return (
    <Sheet title={budget.name} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>
            Amount per {budget.period} <span className="muted">(applies from this {budget.period} on)</span>
          </span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={!cents}>
          Save
        </button>
      </form>

      <div className="stack danger-zone">
        {!budget.isDefault && (
          <button className="btn" onClick={() => void attempt(() => setDefaultBudget(budget.id)).then((ok) => ok && onClose())}>
            Make default
          </button>
        )}
        <button
          className="btn"
          disabled={bal === 0}
          onClick={() => {
            if (!confirm(`Reset balance from ${fmt(bal)} to ${fmt(0)}? This is recorded in history as an adjustment.`)) return;
            void attempt(() => resetBalance(budget.id, today)).then((ok) => {
              if (ok) {
                toast('Balance reset');
                onClose();
              }
            });
          }}
        >
          Reset balance ({fmt(bal)})
        </button>
        <button
          className="btn danger"
          onClick={() => {
            const msg =
              bal > 0
                ? `This budget still has ${fmt(bal)} left. Move it to a goal first if you want to keep it. Archive anyway?`
                : 'Archive this budget? Its history is kept in backups.';
            if (confirm(msg)) void attempt(() => archiveBudget(budget.id)).then((ok) => ok && onClose());
          }}
        >
          Archive budget
        </button>
      </div>
    </Sheet>
  );
}

function StorageStatus() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);
  if (persisted === null) return null;
  return persisted ? (
    <p className="muted small">✓ Storage is marked persistent.</p>
  ) : (
    <p className="muted small">
      Storage isn’t marked persistent, so the browser may clear it.{' '}
      <button className="link" onClick={() => navigator.storage.persist().then(setPersisted)}>
        Request persistence
      </button>{' '}
      — installing the app to your home screen helps too.
    </p>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function InstallCard() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (standalone) return null;
  if (!evt && !ios) return null;
  return (
    <section className="card stack">
      <h2>Install</h2>
      {evt ? (
        <button className="btn primary" onClick={() => void evt.prompt().then(() => setEvt(null))}>
          Install Deficit
        </button>
      ) : (
        <p className="muted small">In Safari, tap Share → “Add to Home Screen”. Installed apps keep their data more reliably.</p>
      )}
    </section>
  );
}

function daysAgo(n: number) {
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}

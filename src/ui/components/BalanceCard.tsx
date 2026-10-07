import type { PeriodSummary } from '../../domain/ledger';
import { currentPeriodLabel } from '../../domain/period';
import type { Budget } from '../../domain/types';
import { useApp } from '../state';

export function BalanceCard({ budget, summary }: { budget: Budget; summary?: PeriodSummary }) {
  const { fmt } = useApp();
  if (!summary) {
    return (
      <section className="balance-card">
        <p className="balance-label">Starts {budget.startDate}</p>
        <p className="balance-amount">{fmt(0)}</p>
      </section>
    );
  }
  const { remaining, carriedIn, allowance, spent, moved, adjusted } = summary;
  const tone = remaining < 0 ? 'neg' : remaining === 0 ? 'zero' : 'pos';
  const label = currentPeriodLabel(budget.period);

  return (
    <section className={`balance-card tone-${tone}`} aria-live="polite">
      <p className="balance-label">{remaining < 0 ? `Over budget ${label}` : `Left ${label}`}</p>
      <p className="balance-amount">{fmt(Math.abs(remaining))}</p>
      <dl className="breakdown">
        {carriedIn !== 0 && <Item label="Carried" value={fmt(carriedIn, { signed: true })} tone={carriedIn < 0 ? 'neg' : 'pos'} />}
        <Item label={capitalize(label)} value={fmt(allowance, { signed: true })} />
        {spent !== 0 && <Item label="Spent" value={fmt(-spent, { signed: true })} />}
        {moved !== 0 && <Item label="To goals" value={fmt(-moved, { signed: true })} />}
        {adjusted !== 0 && <Item label="Adjusted" value={fmt(adjusted, { signed: true })} />}
      </dl>
    </section>
  );
}

function Item({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

import { deleteEntry, restoreEntry } from '../../db/repo';
import { parseISODate } from '../../domain/period';
import type { Entry } from '../../domain/types';
import { useApp } from '../state';

export function EntryRow({ entry, showDate, onEdit }: { entry: Entry; showDate?: boolean; onEdit?: (e: Entry) => void }) {
  const { fmt, data, attempt, toast } = useApp();
  const goal = entry.goalId ? data.goals.find((g) => g.id === entry.goalId) : undefined;

  const title =
    entry.kind === 'spend'
      ? entry.note || 'Spent'
      : entry.kind === 'to_goal'
        ? `→ ${goal?.name ?? 'Goal'}`
        : entry.kind === 'from_goal'
          ? `← ${goal?.name ?? 'Goal'}`
          : entry.note || 'Adjustment';
  const signed = entry.kind === 'spend' || entry.kind === 'to_goal' ? -entry.amountCents : entry.amountCents;

  const remove = async () => {
    const ok = await attempt(() => deleteEntry(entry.id));
    if (ok) toast('Entry deleted', { action: { label: 'Undo', run: () => void restoreEntry(entry.id) } });
  };

  const editable = entry.kind === 'spend' && onEdit;
  return (
    <li className="entry-row">
      <button className="entry-main" disabled={!editable} onClick={() => editable && onEdit(entry)}>
        <span className="entry-title">{title}</span>
        {showDate && (
          <span className="entry-sub">
            {parseISODate(entry.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        )}
      </button>
      <span className={`entry-amount ${signed < 0 ? '' : 'pos'}`}>{fmt(signed, { signed: true })}</span>
      <button className="icon-btn subtle" onClick={remove} aria-label="Delete entry">
        ✕
      </button>
    </li>
  );
}

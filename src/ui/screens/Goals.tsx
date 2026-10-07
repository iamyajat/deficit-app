import { useState } from 'react';
import { archiveGoal, createGoal, setGoalAchieved, updateGoal } from '../../db/repo';
import { goalEtaDays, goalSaved } from '../../domain/goals';
import { centsToInput, parseCents } from '../../domain/money';
import type { Goal } from '../../domain/types';
import { Icon } from '../components/Icon';
import { MoveSheet } from '../components/MoveSheet';
import { Sheet } from '../components/Sheet';
import { useApp } from '../state';

type Move = { direction: 'in' | 'out'; goalId: string };

export function Goals() {
  const { data } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [move, setMove] = useState<Move | null>(null);

  const visible = data.goals.filter((g) => !g.archivedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const active = visible.filter((g) => !g.achievedAt);
  const achieved = visible.filter((g) => g.achievedAt);

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Goals</h1>
        <button className="btn primary small" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> New goal
        </button>
      </div>

      {visible.length === 0 && (
        <div className="empty-state card">
          <Icon name="target" size={36} />
          <p>Saving for something?</p>
          <p className="muted small">Add a goal, then move any budget surplus into it whenever you’re in the green.</p>
        </div>
      )}

      <ul className="goal-list">
        {active.map((g) => (
          <GoalCard key={g.id} goal={g} onMove={setMove} onEdit={setEditing} />
        ))}
      </ul>

      {achieved.length > 0 && (
        <>
          <h2 className="section-title">Achieved</h2>
          <ul className="goal-list">
            {achieved.map((g) => (
              <GoalCard key={g.id} goal={g} onMove={setMove} onEdit={setEditing} />
            ))}
          </ul>
        </>
      )}

      {adding && <GoalForm onClose={() => setAdding(false)} />}
      {editing && <GoalForm goal={editing} onClose={() => setEditing(null)} />}
      {move && <MoveSheet direction={move.direction} goalId={move.goalId} onClose={() => setMove(null)} />}
    </div>
  );
}

function GoalCard({ goal, onMove, onEdit }: { goal: Goal; onMove: (m: Move) => void; onEdit: (g: Goal) => void }) {
  const { data, fmt, today } = useApp();
  const saved = goalSaved(goal.id, data.entries);
  const pct = Math.min(100, Math.round((saved / goal.targetCents) * 100));
  const eta = goal.achievedAt ? null : goalEtaDays(goal, saved, today);

  return (
    <li className={`card goal-card ${goal.achievedAt ? 'achieved' : ''}`}>
      <button className="goal-head" onClick={() => onEdit(goal)} aria-label={`Edit ${goal.name}`}>
        <span className="goal-name">{goal.name}</span>
        <span className="goal-pct">{pct}%</span>
      </button>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="goal-meta muted">
        {fmt(saved)} of {fmt(goal.targetCents)}
        {saved >= goal.targetCents && !goal.achievedAt
          ? ' · fully funded'
          : eta !== null && eta > 0
            ? ` · ~${formatEta(eta)} at this pace`
            : ''}
      </p>
      {!goal.achievedAt && (
        <div className="row">
          <button className="btn primary small" onClick={() => onMove({ direction: 'in', goalId: goal.id })}>
            Add money
          </button>
          <button className="btn small" disabled={saved <= 0} onClick={() => onMove({ direction: 'out', goalId: goal.id })}>
            Withdraw
          </button>
        </div>
      )}
    </li>
  );
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { attempt, data, fmt } = useApp();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? centsToInput(goal.targetCents) : '');
  const cents = parseCents(target);
  const saved = goal ? goalSaved(goal.id, data.entries) : 0;

  const save = async () => {
    if (!cents) return;
    const ok = await attempt(() => (goal ? updateGoal(goal.id, { name, targetCents: cents }) : createGoal(name, cents)));
    if (ok) onClose();
  };

  return (
    <Sheet title={goal ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span>What are you saving for?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="iPhone" autoFocus={!goal} required />
        </label>
        <label className="field">
          <span>Target amount</span>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1000" required />
        </label>
        <button className="btn primary" type="submit" disabled={!cents || !name.trim()}>
          {goal ? 'Save' : 'Create goal'}
        </button>
        {goal && (
          <div className="row">
            <button
              type="button"
              className="btn small"
              onClick={() => void attempt(() => setGoalAchieved(goal.id, !goal.achievedAt)).then((ok) => ok && onClose())}
            >
              {goal.achievedAt ? 'Mark not achieved' : 'Mark achieved'}
            </button>
            <button
              type="button"
              className="btn small danger"
              onClick={() => {
                const msg =
                  saved > 0 && !goal.achievedAt
                    ? `This goal still holds ${fmt(saved)}. Archiving hides it and that money stays set aside. Withdraw it first if you want it back in a budget. Archive anyway?`
                    : 'Archive this goal?';
                if (confirm(msg)) void attempt(() => archiveGoal(goal.id)).then((ok) => ok && onClose());
              }}
            >
              Archive
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

function formatEta(days: number): string {
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

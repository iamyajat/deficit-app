import { useMemo, useState } from 'react';
import { moveToGoal, withdrawFromGoal } from '../../db/repo';
import { goalSaved, maxMovable, maxWithdrawable } from '../../domain/goals';
import { centsToInput, parseCents } from '../../domain/money';
import { useApp } from '../state';
import { Sheet } from './Sheet';

/**
 * Move surplus from a budget into a goal ("in"), or withdraw from a goal back into a budget ("out").
 */
export function MoveSheet({
  direction,
  goalId: initialGoal,
  budgetId: initialBudget,
  onClose,
}: {
  direction: 'in' | 'out';
  goalId?: string;
  budgetId?: string;
  onClose: () => void;
}) {
  const { data, activeBudgets, selectedBudget, balanceOf, fmt, today, attempt, toast } = useApp();
  const goals = data.goals.filter((g) => !g.archivedAt);
  const [goalId, setGoalId] = useState(initialGoal ?? goals[0]?.id ?? '');
  const [budgetId, setBudgetId] = useState(initialBudget ?? selectedBudget?.id ?? activeBudgets[0]?.id ?? '');
  const budget = activeBudgets.find((b) => b.id === budgetId);
  const goal = goals.find((g) => g.id === goalId);

  const max = useMemo(() => {
    if (direction === 'in') return budget ? maxMovable(balanceOf(budget)) : 0;
    return goal ? maxWithdrawable(goalSaved(goal.id, data.entries)) : 0;
  }, [direction, budget, goal, balanceOf, data.entries]);

  const [amount, setAmount] = useState(() => (max > 0 ? centsToInput(max) : ''));
  const cents = parseCents(amount);
  const valid = cents !== null && cents > 0 && cents <= max && !!goal && !!budget;

  const submit = async () => {
    if (!valid || !goal || !budget) return;
    const input = { budgetId: budget.id, goalId: goal.id, amountCents: cents, today };
    const ok = await attempt(() => (direction === 'in' ? moveToGoal(input) : withdrawFromGoal(input)));
    if (ok) {
      toast(direction === 'in' ? `Moved ${fmt(cents)} to ${goal.name}` : `Withdrew ${fmt(cents)} from ${goal.name}`);
      onClose();
    }
  };

  if (goals.length === 0) {
    return (
      <Sheet title="Move to goal" onClose={onClose}>
        <p className="muted">Create a goal first on the Goals tab.</p>
      </Sheet>
    );
  }

  const budgetSelect = (
    <label className="field">
      <span>{direction === 'in' ? 'From budget' : 'Into budget'}</span>
      <select
        value={budgetId}
        onChange={(e) => {
          setBudgetId(e.target.value);
          if (direction === 'in') {
            const b = activeBudgets.find((x) => x.id === e.target.value);
            const m = b ? maxMovable(balanceOf(b)) : 0;
            setAmount(m > 0 ? centsToInput(m) : '');
          }
        }}
      >
        {activeBudgets.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} ({fmt(balanceOf(b))})
          </option>
        ))}
      </select>
    </label>
  );
  const goalSelect = (
    <label className="field">
      <span>{direction === 'in' ? 'To goal' : 'From goal'}</span>
      <select
        value={goalId}
        onChange={(e) => {
          setGoalId(e.target.value);
          if (direction === 'out') {
            const m = maxWithdrawable(goalSaved(e.target.value, data.entries));
            setAmount(m > 0 ? centsToInput(m) : '');
          }
        }}
      >
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} ({fmt(goalSaved(g.id, data.entries))} saved)
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Sheet title={direction === 'in' ? 'Move to goal' : 'Withdraw from goal'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {direction === 'in' ? budgetSelect : goalSelect}
        {direction === 'in' ? goalSelect : budgetSelect}

        {max <= 0 ? (
          <p className="muted">
            {direction === 'in' ? 'Nothing to move — this budget has no surplus right now.' : 'This goal is empty.'}
          </p>
        ) : (
          <>
            <label className="field">
              <span>
                Amount <span className="muted">(max {fmt(max)})</span>
              </span>
              <div className="amount-input">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={amount !== '' && !valid}
                />
                <button type="button" className="btn small" onClick={() => setAmount(centsToInput(max))}>
                  Max
                </button>
              </div>
            </label>
            <input
              type="range"
              min={0}
              max={max}
              step={Math.max(1, Math.round(max / 100))}
              value={Math.min(cents ?? 0, max)}
              onChange={(e) => setAmount(centsToInput(Number(e.target.value)))}
              aria-label="Amount slider"
            />
            {cents !== null && cents > max && <p className="error">That’s more than {fmt(max)}.</p>}
          </>
        )}

        <button className="btn primary" type="submit" disabled={!valid}>
          {direction === 'in' ? 'Move' : 'Withdraw'} {valid ? fmt(cents) : ''}
        </button>
      </form>
    </Sheet>
  );
}

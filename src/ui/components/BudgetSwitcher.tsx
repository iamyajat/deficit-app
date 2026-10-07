import { periodAdjective } from '../../domain/period';
import { useApp } from '../state';

export function BudgetSwitcher() {
  const { activeBudgets, selectedBudget, selectBudget } = useApp();
  if (activeBudgets.length < 2) return null;
  return (
    <div className="chips" role="tablist" aria-label="Budgets">
      {activeBudgets.map((b) => (
        <button
          key={b.id}
          role="tab"
          aria-selected={b.id === selectedBudget?.id}
          className={`chip ${b.id === selectedBudget?.id ? 'active' : ''}`}
          onClick={() => selectBudget(b.id)}
        >
          {b.name}
          <span className="chip-sub">{periodAdjective(b.period)}</span>
        </button>
      ))}
    </div>
  );
}

import { useEffect } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

/** Append a key to an amount string, keeping it a valid partial amount (max 2 decimals, 9 digits). */
export function applyKey(value: string, key: string): string {
  if (key === '⌫' || key === 'Backspace') return value.slice(0, -1);
  if (key === '.') return value.includes('.') ? value : (value || '0') + '.';
  if (!/^\d$/.test(key)) return value;
  const [whole, frac] = value.split('.');
  if (frac !== undefined) return frac.length >= 2 ? value : value + key;
  if (whole.length >= 9) return value;
  return whole === '0' ? key : value + key;
}

/** On-screen numeric keypad. Also listens to the physical keyboard while `captureKeys` is true. */
export function Keypad({
  value,
  onChange,
  onSubmit,
  captureKeys,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  captureKeys: boolean;
}) {
  useEffect(() => {
    if (!captureKeys) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      } else if (/^[\d.]$/.test(e.key) || e.key === 'Backspace') {
        e.preventDefault();
        onChange(applyKey(value, e.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [captureKeys, value, onChange, onSubmit]);

  return (
    <div className="keypad">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="key"
          aria-label={k === '⌫' ? 'Backspace' : k === '.' ? 'Decimal point' : k}
          onClick={() => onChange(applyKey(value, k))}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { AppProvider, type Toast } from './ui/state';
import { Home } from './ui/screens/Home';
import { History } from './ui/screens/History';
import { Goals } from './ui/screens/Goals';
import { Settings } from './ui/screens/Settings';

const TABS = [
  { id: 'home', label: 'Today', icon: '◉' },
  { id: 'history', label: 'History', icon: '☰' },
  { id: 'goals', label: 'Goals', icon: '◎' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function readTab(): TabId {
  const h = location.hash.slice(1);
  return (TABS.find((t) => t.id === h)?.id ?? 'home') as TabId;
}

export function App() {
  const [tab, setTab] = useState<TabId>(readTab);
  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <AppProvider toastHost={(t, dismiss) => <ToastView toast={t} dismiss={dismiss} />}>
      <main className="app">
        {tab === 'home' && <Home active />}
        {tab === 'history' && <History />}
        {tab === 'goals' && <Goals />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </a>
        ))}
      </nav>
    </AppProvider>
  );
}

function ToastView({ toast, dismiss }: { toast: Toast | null; dismiss: () => void }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.tone ?? ''}`} role="status">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run();
            dismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

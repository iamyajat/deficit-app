import { useEffect, useState } from 'react';
import { AppProvider, type Toast } from './ui/state';
import { Icon, Logo, type IconName } from './ui/components/Icon';
import { Home } from './ui/screens/Home';
import { History } from './ui/screens/History';
import { Goals } from './ui/screens/Goals';
import { Settings } from './ui/screens/Settings';

const TABS: readonly { id: string; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Today', icon: 'wallet' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'goals', label: 'Goals', icon: 'target' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

function readTab(): string {
  const h = location.hash.slice(1);
  return TABS.find((t) => t.id === h)?.id ?? 'home';
}

export function App() {
  const [tab, setTab] = useState(readTab);
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
      <div className="shell">
        <nav className="nav" aria-label="Main">
          <div className="brand">
            <Logo />
            <span>Deficit</span>
          </div>
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined}>
              <Icon name={t.icon} size={22} />
              <span>{t.label}</span>
            </a>
          ))}
        </nav>
        <main className={`app tab-${tab}`}>
          {tab === 'home' && <Home active />}
          {tab === 'history' && <History />}
          {tab === 'goals' && <Goals />}
          {tab === 'settings' && <Settings />}
        </main>
      </div>
    </AppProvider>
  );
}

function ToastView({ toast, dismiss }: { toast: Toast | null; dismiss: () => void }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.tone ?? ''}`} role="status" key={toast.id}>
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

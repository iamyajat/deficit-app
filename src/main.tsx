import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import '@fontsource-variable/geist/wght.css';
import './styles.css';

registerSW({ immediate: true });

// Ask the browser not to evict our IndexedDB under storage pressure (best effort).
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

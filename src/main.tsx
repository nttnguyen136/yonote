import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SharedNotePage } from './components/SharedNotePage';
import { getDiagramTheme, getThemeColor, isThemePreference, resolveTheme } from './lib/theme';
import './styles.css';
import './share.css';
import './resizable-layout.css';

// Apply the saved appearance before React mounts to avoid a light/dark flash.
try {
  const stored = window.localStorage.getItem('yonote-theme');
  const preference = isThemePreference(stored) ? stored : 'system';
  const resolved = resolveTheme(preference, window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = getDiagramTheme(resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getThemeColor(resolved));
} catch {
  // The app will apply the system theme after mounting when storage is blocked.
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)\/?$/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shareMatch ? <SharedNotePage shareId={shareMatch[1]} /> : <App />}
  </StrictMode>,
);

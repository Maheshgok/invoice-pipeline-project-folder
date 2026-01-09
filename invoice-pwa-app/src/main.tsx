import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import SharedResultPage from './components/SharedResultPage.tsx';
import QuickAccessPage from './components/QuickAccessPage.tsx';
import './index.css';

// PWA-specific initialization
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Service worker will be registered automatically by vite-plugin-pwa
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/shared/:shareToken" element={<SharedResultPage />} />
        <Route path="/quick-access" element={<QuickAccessPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

// PWA install prompt handling
declare global {
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
      outcome: 'accepted' | 'dismissed';
      platform: string;
    }>;
    prompt(): Promise<void>;
  }
  
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
  deferredPrompt = null;
});

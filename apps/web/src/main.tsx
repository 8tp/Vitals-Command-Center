import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { listenToSystemTheme, useThemeStore, applyTheme } from './stores/themeStore.js';
import './styles/tokens.css';
import './styles/globals.css';
// Type: Plus Jakarta Sans — one friendly geometric family for everything.
// Loaded via Google Fonts (preconnect + <link> in index.html).

// Reconcile <html data-theme> with the store (in case storage changed between
// the inline bootstrap and hydration), then track OS preference changes.
applyTheme(useThemeStore.getState().resolved);
listenToSystemTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.js';
import { initPwa } from './pwa.js';

initPwa();

const el = document.getElementById('root');
if (!el) throw new Error('falta #root');
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

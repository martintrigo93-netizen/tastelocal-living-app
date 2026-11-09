import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Global Maps error and quota tap
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// PWA service worker registration
// eslint-disable-next-line no-restricted-globals
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
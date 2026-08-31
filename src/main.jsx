import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Keep the installed app up to date: check for a new deployed version
// whenever the app is opened or regains focus, and reload automatically
// once the new version has taken over.
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  function checkForUpdate() {
    navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
  }

  window.addEventListener('load', () => {
    checkForUpdate();
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
  });
}
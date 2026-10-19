import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

// Remove initial pre-rendered splash once React mounts
const rootElement = document.getElementById('root');

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('Global script error:', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
  });
}

if (rootElement) {
  try {
    const root = createRoot(rootElement);
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (mountErr: any) {
    console.error('Fatal mount error:', mountErr);
    rootElement.innerHTML = `
      <div style="min-height: 100vh; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #000; color: #fff; text-align: center; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
        <div style="width: 56px; height: 56px; border-radius: 20px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 16px;">!</div>
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Trip App</h2>
        <p style="font-size: 14px; color: #8e8e93; max-width: 320px; margin-bottom: 24px;">${mountErr?.message || 'Error initializing application.'}</p>
        <button onclick="window.location.reload()" style="padding: 12px 24px; border-radius: 9999px; background: #0A84FF; color: #fff; border: none; font-weight: 600; cursor: pointer;">Reload App</button>
      </div>
    `;
  }
}

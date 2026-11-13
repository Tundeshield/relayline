import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/app.css';
import { initStore, getState } from './data/store';
import { bootstrap } from './data/seed';
import { startSimulator } from './services/simulator';
import App from './App';
import { ToastProvider, ConfirmProvider } from './components/ui';

initStore(bootstrap);
document.documentElement.dataset.textSize = getState().prefs?.textSize || 'default';
startSimulator();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

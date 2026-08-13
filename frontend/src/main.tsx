import './globals';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import '@midnight-ntwrk/dapp-connector-api';
import App from './App';
import './index.css';
import { initMonitoring } from './lib/monitoring.js';
import { trackPageView } from './lib/analytics.js';
import { startWebVitals } from './lib/web-vitals.js';

// Network target. Defaults to the local docker-compose devnet ("undeployed").
const networkId = import.meta.env.VITE_NETWORK_ID ?? 'undeployed';
setNetworkId(networkId);

// Observability: error monitoring (Sentry when VITE_SENTRY_DSN is set),
// passive web-vitals collection, and a page-view beacon when analytics are
// configured. All are no-ops unless the build provided credentials.
initMonitoring();
startWebVitals();
trackPageView();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App networkId={networkId} />
  </React.StrictMode>,
);

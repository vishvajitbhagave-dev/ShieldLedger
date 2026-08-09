import './globals';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import '@midnight-ntwrk/dapp-connector-api';
import App from './App';
import './index.css';

// Network target. Defaults to the local docker-compose devnet ("undeployed").
const networkId = import.meta.env.VITE_NETWORK_ID ?? 'undeployed';
setNetworkId(networkId);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App networkId={networkId} />
  </React.StrictMode>,
);

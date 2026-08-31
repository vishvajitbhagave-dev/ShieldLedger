import React from 'react';
import type { CircuitBreakerStatus, Severity } from '../circuit-breaker.js';

interface HealthBannerProps {
  status: CircuitBreakerStatus;
}

const healthClass: Record<Severity, string> = {
  healthy: 'sl-health-healthy',
  warning: 'sl-health-warning',
  critical: 'sl-health-critical',
};

const label: Record<Severity, string> = {
  healthy: 'All systems healthy',
  warning: 'Platform health warning',
  critical: 'Critical: platform health alert',
};

export const HealthBanner: React.FC<HealthBannerProps> = ({ status }) => {
  return (
    <div className={`sl-health-banner ${healthClass[status.health]}`} role="status" aria-live="polite">
      <span>{label[status.health]}</span>
      {status.triggered.length > 0 && (
        <ul className="u-fine">
          {status.triggered.map((t) => (
            <li key={t.name}>{t.detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
import React from 'react';
import type { CircuitBreakerStatus, Severity } from '../circuit-breaker.js';

interface HealthBannerProps {
  status: CircuitBreakerStatus;
}

const bannerStyles: Record<Severity, React.CSSProperties> = {
  healthy: {
    background: 'var(--success-soft)',
    color: 'var(--success)',
    border: '1px solid rgba(0, 191, 166, 0.25)',
  },
  warning: {
    background: 'var(--warning-soft)',
    color: 'var(--warning)',
    border: '1px solid rgba(217, 119, 6, 0.25)',
  },
  critical: {
    background: 'var(--danger-soft)',
    color: 'var(--danger)',
    border: '1px solid rgba(220, 38, 38, 0.25)',
  },
};

const label: Record<Severity, string> = {
  healthy: 'All systems healthy',
  warning: 'Platform health warning',
  critical: 'Critical: platform health alert',
};

export const HealthBanner: React.FC<HealthBannerProps> = ({ status }) => {
  const style: React.CSSProperties = {
    ...bannerStyles[status.health],
    borderRadius: '10px',
    padding: '0.75rem 1rem',
    fontWeight: 600,
    fontSize: '0.9rem',
    marginBottom: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  };

  return (
    <div style={style} role="status" aria-live="polite">
      <span>{label[status.health]}</span>
      {status.triggered.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontWeight: 500, fontSize: '0.82rem', lineHeight: 1.4 }}>
          {status.triggered.map((t) => (
            <li key={t.name}>{t.detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

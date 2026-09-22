import React from 'react';

interface EmptyStateProps {
  readonly title: string;
  readonly description?: React.ReactNode;
  /** Optional next-step action (e.g. a Link or button). */
  readonly children?: React.ReactNode;
  /** Smaller, quieter treatment for empties nested inside section cards. */
  readonly compact?: boolean;
}

/**
 * Consistent "nothing here yet" block. Always explains what's missing and,
 * where useful, what to do next — never just a bare "no data" line.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, children, compact }) => (
  <div className={`sl-empty-state${compact ? ' sl-empty-state-compact' : ''}`}>
    <div className="sl-empty-state-body">
      <p className="sl-empty-state-title">{title}</p>
      {description != null && <p className="sl-empty-state-desc">{description}</p>}
    </div>
    {children != null && <div className="sl-empty-state-actions">{children}</div>}
  </div>
);
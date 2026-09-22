import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Consistent page-level heading used under the persistent nav shell on every
 * routed page: title + subtitle on the left, optional actions on the right.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="sl-page-head">
    <div className="sl-page-head-text">
      <h2 className="sl-page-head-title">{title}</h2>
      {subtitle != null && <p className="sl-page-head-subtitle">{subtitle}</p>}
    </div>
    {actions != null && <div className="sl-page-head-actions">{actions}</div>}
  </div>
);
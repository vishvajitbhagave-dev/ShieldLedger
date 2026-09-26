import React from 'react';

/**
 * Inline "still connecting" indicator for data regions whose page layout
 * renders immediately (headings, notes, tables, summaries) while the live
 * ledger stream connects — so a page never blanks out waiting for data.
 */
export const ConnectingState: React.FC<{ label: string; hint?: string }> = ({ label, hint }) => (
  <p className="sl-loading-inline" role="status" aria-live="polite">
    <span className="sl-loading-spinner sl-loading-spinner-sm" aria-hidden="true" />
    <span>{label}</span>
    {hint != null && <span className="sl-loading-inline-hint">{hint}</span>}
  </p>
);

/**
 * Em-dash placeholder table row so tables keep their full structure (headers +
 * a body) while data is still loading, instead of the whole area blanking.
 */
export const SkeletonRow: React.FC<{ columns: number }> = ({ columns }) => (
  <tr className="sl-skeleton-row" aria-hidden="true">
    {Array.from({ length: columns }, (_, i) => (
      <td key={i} className="sl-skeleton-cell">
        —
      </td>
    ))}
  </tr>
);
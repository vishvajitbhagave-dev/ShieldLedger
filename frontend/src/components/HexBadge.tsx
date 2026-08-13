import React, { useState } from 'react';

interface HexBadgeProps {
  hex: string;
  shortLength?: number;
}

export const HexBadge: React.FC<HexBadgeProps> = ({ hex, shortLength = 10 }) => {
  const [copied, setCopied] = useState(false);

  if (!hex) return <span>—</span>;

  const displayHex = hex.length > shortLength + 6
    ? `${hex.slice(0, shortLength)}…${hex.slice(-6)}`
    : hex;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  return (
    <span className="sl-hex-badge-container">
      <button
        type="button"
        className="sl-hex-badge"
        onClick={handleCopy}
        title="Click to copy full hash"
      >
        <span className="sl-mono">{displayHex}</span>
        <svg
          className="sl-hex-badge-icon"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {copied && <span className="sl-hex-badge-tooltip">Copied!</span>}
      </button>
    </span>
  );
};

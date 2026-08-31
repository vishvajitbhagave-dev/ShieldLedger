import React from 'react';
import type { MarketDepth } from '../bid-depth.js';

/**
 * Order-book style bid-depth visualization (pure SVG, no charting dependency).
 *
 * Renders the disclosed winning bids across all resolved single-lender auctions
 * as a rate-depth chart:
 *   - Rates ascend left→right (lowest rate = best offer for the borrower).
 *   - Bar height = total disclosed amount at that rate (scaled to the max).
 *   - Whole-invoice vs split winners are distinguished by stacked fill.
 *   - The lowest-rate (best) level is highlighted as the current best offer;
 *     every level shown is itself a per-invoice winning bid (all public).
 *   - Pool/committed bids appear as a dedicated lane with an honest note that
 *     their terms are committed (private) and not plotted on the rate axis.
 *
 * Empty/sparse handling: 0 levels → informative empty message; a single level
 * still renders a readable single-bar chart (no broken axes).
 */

interface Props {
  readonly depth: MarketDepth;
}

const WHOLE_FILL = 'var(--accent, #4f8cff)';
const SPLIT_FILL = 'var(--chip, #99a2b8)';
const BEST_FILL = '#2bb673';
const GRID = 'var(--border, #e3e6ee)';
const TEXT = 'var(--text, #1c2333)';

const W = 560;
const H = 200;
const PAD_L = 46; // y-axis labels
const PAD_B = 34; // x-axis labels
const PAD_T = 12;
const PAD_R = 12;

function fmtRate(rateBps: bigint): string {
  return `${rateBps.toString()}bp`;
}

export const BidDepthChart: React.FC<Props> = ({ depth }) => {
  const { levels, maxLevelAmount, cumulativeAmount, poolCommitCount, disclosedCount } = depth;

  if (disclosedCount === 0) {
    return (
      <div className="sl-stage">
        <p className="sl-empty">
          No revealed bids yet — bids stay sealed until a lender reveals. This depth chart fills
          in as winning bids are disclosed (only the winning bid's terms are public by design).
        </p>
        {poolCommitCount > 0 && (
          <p className="sl-meta">
            {poolCommitCount} committed pool bid(s) exist — their rate/amount are committed and
            private, so they are not plotted on the rate axis.
          </p>
        )}
      </div>
    );
  }

  const n = levels.length;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const slotW = innerW / Math.max(n, 1);
  const barMax = maxLevelAmount > 0n ? maxLevelAmount : 1n;
  const maxCumulative = cumulativeAmount[cumulativeAmount.length - 1] ?? 0n;

  // Node positions for each level's bar + cumulative overlay.
  const barXs = levels.map((_, i) => PAD_L + i * slotW + slotW * 0.2);
  const barW = slotW * 0.6;
  const barHeights = levels.map((l) =>
    l.totalAmount > 0n ? Number((l.totalAmount * BigInt(innerH)) / barMax) : 0,
  );

  // Cumulative depth polyline (0..maxCumulative mapped to innerH, plotted right-aligned
  // like a book's cumulative depth from the best side).
  const pts: string[] = [];
  const cumMax = maxCumulative > 0n ? maxCumulative : 1n;
  for (let i = 0; i < n; i++) {
    const x = PAD_L + i * slotW + slotW / 2;
    const cum = cumulativeAmount[i];
    const y = innerH + PAD_T - Number((cum * BigInt(innerH)) / cumMax);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const cumPoly = pts.join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Bid depth chart by interest rate"
        className="u-chart"
        style={{ maxWidth: W }}
      >
        {/* y-axis gridlines + labels (0..max amount) */}
        {yTicks.map((f) => {
          const y = innerH + PAD_T - f * innerH;
          const val = (maxLevelAmount > 0n ? maxLevelAmount : 1n) * BigInt(Math.round(f * 100)) / 100n;
          return (
            <g key={f}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize={10} fill={TEXT}>
                {val.toString()}
              </text>
            </g>
          );
        })}

        {/* per-level bars: whole (solid) with split marker on top */}
        {levels.map((l, i) => {
          const x = barXs[i];
          const h = barHeights[i];
          const isBest = i === 0;
          return (
            <g key={i}>
              <rect
                x={x}
                y={innerH + PAD_T - h}
                width={barW}
                height={h}
                fill={isBest ? BEST_FILL : WHOLE_FILL}
                rx={2}
              />
              {l.splitCount > 0 && (
                <rect
                  x={x}
                  y={innerH + PAD_T - h}
                  width={barW}
                  height={4}
                  fill={SPLIT_FILL}
                />
              )}
              <text
                x={x + barW / 2}
                y={Math.max(14, innerH + PAD_T - h - 4)}
                textAnchor="middle"
                fontSize={10}
                fill={TEXT}
              >
                {fmtRate(l.rateBps)}
              </text>
              {l.count > 1 && (
                <text
                  x={x + barW / 2}
                  y={innerH + PAD_T + 12}
                  textAnchor="middle"
                  fontSize={10}
                  fill={TEXT}
                >
                  ×{l.count}
                </text>
              )}
            </g>
          );
        })}

        {/* cumulative depth polyline */}
        {n > 1 && <polyline points={cumPoly} fill="none" stroke={TEXT} strokeWidth={1.5} strokeDasharray="3 2" />}

        <line x1={PAD_L} y1={innerH + PAD_T} x2={W - PAD_R} y2={innerH + PAD_T} stroke={TEXT} strokeWidth={1} />
        <text x={PAD_L} y={H - 8} fontSize={10} fill={TEXT}>rate (lowest → best)</text>
      </svg>

      <p className="sl-note u-mt-2">
        {disclosedCount} winning bid(s) disclosed across {levels.length} rate level(s).
        Green = best (lowest) rate offer · blue = whole-invoice · grey cap = split winner.
        Dotted line = cumulative disclosed amount. Every bar is a real disclosed
        winning bid — non-winning bids' terms are never published on-chain.
      </p>
      {poolCommitCount > 0 && (
        <p className="sl-meta">
          {poolCommitCount} committed pool bid(s) not shown on the rate axis (their terms are
          private until settled; only their commitments are on-chain).
        </p>
      )}
    </div>
  );
};

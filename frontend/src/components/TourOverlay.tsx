import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../context.js';
import { getTourSteps } from '../tour.js';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 14;
/** Polls for a step target for roughly this many animation frames before giving up. */
const MAX_LOOKUP_FRAMES = 90;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Dismissible stage-by-stage guided tour. Renders a spotlight (four dim panels
 * around the target element) plus a positioned tooltip card. Started only from
 * the "Take a tour" button on the HowItWorksCard; Esc, Skip, or a click on the
 * dim background ends it early. Stays purely local — no tracking, no storage,
 * no wallet data.
 */
export const TourOverlay: React.FC<{ role: Role; onClose: () => void }> = ({ role, onClose }) => {
  const steps = useMemo(() => getTourSteps(role), [role]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const cardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const step = steps[index];

  const refresh = useCallback((): void => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height, right: box.right, bottom: box.bottom });
    const cardHeight = cardRef.current?.offsetHeight ?? 150;
    setPlacement(window.innerHeight - box.bottom >= cardHeight + TOOLTIP_GAP ? 'bottom' : 'top');
  }, [step]);

  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    let frame = 0;
    let handle = 0;

    if (location.pathname !== step.path) {
      navigate(step.path);
    }

    const tick = (): void => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        const box = el.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
          requestAnimationFrame(refresh);
          return;
        }
      }
      frame += 1;
      if (frame >= MAX_LOOKUP_FRAMES) {
        if (index + 1 < steps.length) setIndex(index + 1);
        else onClose();
        return;
      }
      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [step, steps, index, location.pathname, navigate, onClose, refresh]);

  useEffect(() => {
    window.addEventListener('scroll', refresh, { capture: true, passive: true });
    window.addEventListener('resize', refresh);
    return () => {
      window.removeEventListener('scroll', refresh, { capture: true });
      window.removeEventListener('resize', refresh);
    };
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  const next = useCallback((): void => {
    if (index + 1 < steps.length) setIndex(index + 1);
    else onClose();
  }, [index, steps.length, onClose]);

  const back = useCallback((): void => {
    if (index > 0) setIndex(index - 1);
  }, [index]);

  if (!step) return null;

  const total = steps.length;
  const last = index + 1 >= total;
  const viewportWidth = window.innerWidth;
  const cardWidth = Math.min(TOOLTIP_WIDTH, viewportWidth - 24);

  const tooltipStyle: React.CSSProperties = rect
    ? {
        width: cardWidth,
        left: clamp(rect.left + rect.width / 2 - cardWidth / 2, 8, viewportWidth - cardWidth - 8),
        ...(placement === 'bottom'
          ? { top: rect.bottom + TOOLTIP_GAP }
          : { top: rect.top - TOOLTIP_GAP, transform: 'translateY(-100%)' }),
      }
    : { width: cardWidth, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  const panels: React.CSSProperties[] = rect
    ? [
        { top: 0, left: 0, right: 0, height: Math.max(rect.top, 0) },
        { top: rect.bottom, left: 0, right: 0, height: Math.max(window.innerHeight - rect.bottom, 0) },
        { top: rect.top, left: 0, width: Math.max(rect.left, 0), height: rect.height },
        { top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height },
      ]
    : [{ top: 0, left: 0, right: 0, bottom: 0 }];

  return (
    <div className="sl-tour">
      {panels.map((style, i) => (
        <div key={i} className="sl-tour-panel" style={style} aria-hidden="true" onClick={onClose} />
      ))}
      {rect != null && (
        <div
          className="sl-tour-hole"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      <div
        ref={cardRef}
        className="sl-tour-card"
        role="dialog"
        aria-label="Product tour"
        data-placement={placement}
        tabIndex={-1}
        style={tooltipStyle}
      >
        {rect == null && <p className="sl-tour-loading">Loading next step…</p>}
        <p className="sl-tour-step">
          Step {index + 1} of {total}
        </p>
        <h3 className="sl-tour-title">{step.title}</h3>
        <p className="sl-tour-body">{step.body}</p>
        <div className="sl-tour-actions">
          <button type="button" className="sl-button-ghost" onClick={onClose}>
            Skip tour
          </button>
          <button type="button" className="sl-button-ghost" onClick={back} disabled={index === 0}>
            Back
          </button>
          <button type="button" className="sl-button" onClick={next}>
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};
import React, { useState } from 'react';
import type { Role } from '../context.js';
import { onboardingCopyFor, isOnboardingDismissed, dismissOnboarding } from '../onboarding.js';

/**
 * Dismissible "How it works in this app" card for first-time users, shown on
 * the Home page per role. Distinct from the NextStepsCard: this is static
 * explainer copy about the workflow, persisted per role in localStorage
 * (shieldledger.onboarding.dismissed.<role>) so it is shown once per role per
 * browser. Storage is wrapped in try/catch so a blocked storage never breaks
 * the app. No tracking, no wallet data — role-only, purely local.
 */
export const HowItWorksCard: React.FC<{ role: Role; onStartTour?: () => void }> = ({ role, onStartTour }) => {
  const [dismissed, setDismissed] = useState<boolean>(() => isOnboardingDismissed(role));

  if (dismissed) return null;

  const copy = onboardingCopyFor(role);

  const close = () => {
    setDismissed(true);
    dismissOnboarding(role);
  };

  return (
    <div className="sl-stage sl-onboarding" role="region" aria-label="How it works in this app">
      <div className="sl-onboarding-head">
        <h3 className="sl-onboarding-title">How it works in this app</h3>
        <button
          type="button"
          className="sl-nextstep-dismiss sl-onboarding-close"
          aria-label="Dismiss: I understand how it works"
          title="Dismiss"
          onClick={close}
        >
          ×
        </button>
      </div>
      <p className="sl-onboarding-summary">{copy.summary}</p>
      <ol className="sl-onboarding-steps">
        {copy.steps.map((step) => (
          <li key={step.title} className="sl-onboarding-step">
            <span className="sl-onboarding-step-title">{step.title}</span>
            <span className="sl-onboarding-step-text">{step.text}</span>
          </li>
        ))}
      </ol>
      <p className="sl-onboarding-sealed">{copy.sealedBidLine}</p>
      <div className="sl-onboarding-actions">
        {onStartTour != null && (
          <button type="button" className="sl-button sl-button-secondary" onClick={onStartTour}>
            Take a tour
          </button>
        )}
        <button type="button" className="sl-button" onClick={close}>
          Got it
        </button>
      </div>
    </div>
  );
};
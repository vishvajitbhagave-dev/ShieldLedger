import React from 'react';
import { describeError } from '../lib/errorMessages.js';

const RENDER_FAILURE_MESSAGE =
  'Something went wrong rendering this part of the app. Please try again — if it keeps happening, refresh the page.';

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render-time errors so a bad state can never blank the whole app. */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="sl-error sl-error-banner">
          <div className="sl-error-body">
            <span className="sl-error-message">{RENDER_FAILURE_MESSAGE}</span>
          </div>
          <details className="sl-error-tech-details">
            <summary>Show technical details</summary>
            <pre className="sl-error-tech">
              {describeError('render', this.state.error).technical || '(the underlying error had no message)'}
            </pre>
          </details>
          <button
            className="sl-button sl-button-secondary"
            type="button"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

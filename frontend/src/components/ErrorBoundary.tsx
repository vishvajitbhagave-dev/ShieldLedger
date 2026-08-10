import React from 'react';

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
        <div className="sl-error">
          <strong>Something went wrong rendering the app.</strong>
          <p className="sl-meta" style={{ marginBottom: 8 }}>
            {this.state.error.message || String(this.state.error)}
          </p>
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

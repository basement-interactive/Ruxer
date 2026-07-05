// Top-level error boundary. A throw in any component (e.g. a native API that
// isn't available yet) must never blank the whole window — it renders a
// minimal recoverable fallback instead of an empty <div id="root">.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console so it shows up in the desktop devtools mirror.
    console.error("UI error boundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-box">
            <h1>Something went wrong</h1>
            <p>{this.state.error.message}</p>
            <button onClick={() => this.setState({ error: null })}>Try again</button>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

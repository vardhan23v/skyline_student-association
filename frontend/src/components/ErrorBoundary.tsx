import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';

type Props = { children: ReactNode; /** Changing this (e.g. the route path) clears a caught error. */ resetKey?: string };
type State = { error: Error | null };

/** Catches render/effect errors so one broken page can't white-screen the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto my-16 max-w-md rounded-[var(--radius-lg)] border border-border bg-surface p-6 text-center">
        <AlertCircle className="mx-auto size-8 text-danger" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-text-primary">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-text-secondary">Try again, or go back to the home page. If it keeps happening, tell the committee what you were doing.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>Try again</button>
          <a href="/" className="btn btn-secondary">Home</a>
        </div>
      </div>
    );
  }
}

/** ErrorBoundary that clears itself when the user navigates to another route. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

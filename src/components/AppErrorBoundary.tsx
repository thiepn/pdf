import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordDiagnosticError } from "../diagnostics/errorRepository";
import { routeHref } from "../core/appRouter";

interface Props { children: ReactNode }
interface State { error: Error | null; diagnosticId?: string }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void recordDiagnosticError(error, {
      area: "react",
      operation: "render",
      route: window.location.hash,
      severity: "fatal",
      recoverable: true,
      details: { componentStack: info.componentStack ?? "" }
    }).then((record) => this.setState({ diagnosticId: record.id }));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="fatal-screen" role="alert">
      <section>
        <p className="eyebrow">Workspace recovery</p>
        <h1>PDF Studio stopped rendering</h1>
        <p>Your source files remain in browser storage. Reload the application or open diagnostics before retrying the operation.</p>
        <div className="fatal-screen__actions">
          <button className="button" onClick={() => window.location.reload()} type="button">Reload workspace</button>
          <a className="button button--secondary" href={routeHref({ name: "diagnostics", lab: "system" })}>Open diagnostics</a>
          <a className="button button--ghost" href={routeHref({ name: "home" })}>Return home</a>
        </div>
        <details><summary>Technical details</summary><pre>{this.state.error.message}{this.state.diagnosticId ? `\nDiagnostic ID: ${this.state.diagnosticId}` : ""}</pre></details>
      </section>
    </main>;
  }
}

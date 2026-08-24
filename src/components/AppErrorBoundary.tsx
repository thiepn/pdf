import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordDiagnosticError } from "../diagnostics/errorRepository";
import { routeHref } from "../core/appRouter";
import { presentIssue } from "../trust/issuePresentation";
import { TrustNotice } from "../trust/TrustNotice";

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
    const issue = presentIssue(this.state.error, {
      action: "Workspace rendering",
      recovery: "Reload the workspace once. If the same screen returns, open Diagnostics before retrying the document task.",
      originalSafe: true,
      outputReleased: false
    });
    return <main className="fatal-screen">
      <section>
        <p className="eyebrow">Workspace recovery</p>
        <h1>PDF Studio stopped this workspace safely</h1>
        <TrustNotice
          diagnosticId={this.state.diagnosticId}
          issue={issue}
          actions={<>
            <button className="button" onClick={() => window.location.reload()} type="button">Reload workspace</button>
            <a className="button button--secondary" href={routeHref({ name: "diagnostics", lab: "system" })}>Open diagnostics</a>
            <a className="button button--ghost" href={routeHref({ name: "home" })}>Return home</a>
          </>}
        />
      </section>
    </main>;
  }
}

import type { ReactNode } from "react";
import type { UserIssuePresentation } from "./issuePresentation";
import "./trust.css";

interface TrustNoticeProps {
  issue: UserIssuePresentation;
  actions?: ReactNode;
  diagnosticId?: string;
  compact?: boolean;
}

export function TrustNotice({ issue, actions, diagnosticId, compact = false }: TrustNoticeProps) {
  const alert = issue.category === "product-defect" || issue.category === "resource-limitation";
  return <section
    aria-live={alert ? "assertive" : "polite"}
    className={`trust-notice trust-notice--${issue.category}${compact ? " trust-notice--compact" : ""}`}
    role={alert ? "alert" : "status"}
  >
    <div className="trust-notice__body">
      <p className="trust-notice__label">{issue.label}</p>
      <strong className="trust-notice__title">{issue.title}</strong>
      <p className="trust-notice__summary">{issue.summary}</p>
      <div className="trust-notice__recovery"><strong>What you can do</strong><span>{issue.recovery}</span></div>
      {(issue.originalSafe || issue.outputReleased === false) ? <div className="trust-notice__safety">
        {issue.originalSafe ? <span>Your original PDF is unchanged.</span> : null}
        {issue.outputReleased === false ? <span>No new output was released.</span> : null}
      </div> : null}
      {(issue.technicalDetails || diagnosticId) ? <details className="trust-notice__technical"><summary>Technical details</summary>{issue.technicalDetails ? <pre>{issue.technicalDetails}</pre> : null}{diagnosticId ? <small>Diagnostic ID: {diagnosticId}</small> : null}</details> : null}
    </div>
    {actions ? <div className="trust-notice__actions">{actions}</div> : null}
  </section>;
}

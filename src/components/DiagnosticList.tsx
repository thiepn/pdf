import type { DiagnosticCheck } from "../lab/types";
import { StatusBadge } from "./StatusBadge";

export function DiagnosticList({ checks }: { checks: DiagnosticCheck[] }) {
  if (checks.length === 0) {
    return <p className="empty-state">No checks have run yet.</p>;
  }

  return (
    <div className="diagnostic-list">
      {checks.map((check) => (
        <article className="diagnostic-row" key={check.id}>
          <div className="diagnostic-row__main">
            <strong>{check.label}</strong>
            <p>{check.detail}</p>
          </div>
          <div className="diagnostic-row__meta">
            {typeof check.durationMs === "number" ? <span>{Math.round(check.durationMs)} ms</span> : null}
            <StatusBadge status={check.status} />
          </div>
        </article>
      ))}
    </div>
  );
}

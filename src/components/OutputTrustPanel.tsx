import type { OutputTrustReport, TrustOutcome } from "../trust/outputVerification";

function outcomeLabel(outcome: TrustOutcome): string {
  switch (outcome) {
    case "passed": return "Verified";
    case "changed": return "Changed";
    case "warning": return "Review";
    default: return "Not checked";
  }
}

export function OutputTrustPanel({ report, compact = false }: { report: OutputTrustReport; compact?: boolean }) {
  return <section className={`output-trust${compact ? " output-trust--compact" : ""}`} aria-label="Output verification">
    <header className="output-trust__header">
      <div><p className="eyebrow">OUTPUT VERIFICATION</p><h3>{report.headline}</h3><p>{report.lossy ? "This result includes an intentional lossy or destructive change. Review the consequences before using it." : "PDF Studio checked the produced artifact instead of assuming the operation succeeded."}</p></div>
      <span className={`output-trust__status output-trust__status--${report.level}`}>{report.level === "verified" ? "Verified" : "Verified with notes"}</span>
    </header>
    <dl className="output-trust__facts">{report.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd>{fact.detail ? <small>{fact.detail}</small> : null}</div>)}</dl>
    <div className="output-trust__checks">{report.checks.map((check) => <div className={`output-trust__check output-trust__check--${check.outcome}`} key={check.label}><span aria-hidden="true">{check.outcome === "passed" ? "✓" : check.outcome === "warning" ? "!" : check.outcome === "changed" ? "↔" : "—"}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div><small>{outcomeLabel(check.outcome)}</small></div>)}</div>
    {report.notes.length ? <details className={`output-trust__notes${report.lossy ? " output-trust__notes--lossy" : ""}`} open={report.lossy}><summary>{report.lossy ? "Consequences to review" : "Output notes"} · {report.notes.length}</summary>{report.notes.map((note) => <p key={note}>{note}</p>)}</details> : null}
  </section>;
}

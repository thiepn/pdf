import type { DiagnosticCheck, DiagnosticReport } from "../lab/types";

export function downloadDiagnosticReport(checks: DiagnosticCheck[], filename: string): void {
  const report: DiagnosticReport = {
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    location: window.location.href,
    checks
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

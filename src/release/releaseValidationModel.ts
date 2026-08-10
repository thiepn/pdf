import type { DiagnosticCheck } from "../lab/types";

export type ReleaseValidationStatus = "passed" | "warning" | "failed";

export function summarizeReleaseValidation(checks: DiagnosticCheck[]): ReleaseValidationStatus {
  if (checks.some((check) => check.status === "failed")) return "failed";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "passed";
}

export function listExternalResourceUrls(entries: Array<Pick<PerformanceResourceTiming, "name">>, currentOrigin: string): string[] {
  return [...new Set(entries.map((entry) => entry.name).filter((name) => {
    try { return new URL(name).origin !== currentOrigin; }
    catch { return false; }
  }))].sort();
}

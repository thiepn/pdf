export type CheckStatus = "idle" | "running" | "passed" | "warning" | "failed";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  durationMs?: number;
}

export interface DiagnosticReport {
  generatedAt: string;
  userAgent: string;
  location: string;
  checks: DiagnosticCheck[];
}

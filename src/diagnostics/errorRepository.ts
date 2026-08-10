import { getReleaseInformation } from "../core/release";
import { serializeError, type AppErrorContext, type SerializedAppError } from "../core/errors";
import { idbDelete, idbGetAll, idbPut } from "../storage/database";

export interface DiagnosticErrorRecord extends SerializedAppError {
  id: string;
  release: ReturnType<typeof getReleaseInformation>;
  userAgent: string;
  online: boolean;
}

const MAX_RECORDS = 50;

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeDiagnosticText(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(/blob:[^\s)]+/gi, "[blob-url]")
    .replace(/file:\/\/[^\s)]+/gi, "[file-url]")
    .replace(/([A-Za-z]:\\|\/)(?:[^\s/:*?"<>|]+[\\/]){2,}[^\s)]+/g, "[local-path]")
    .replace(/(["'`])[^\r\n]{80,}?\1/g, "[long-value]")
    .slice(0, 12000);
}

export async function recordDiagnosticError(reason: unknown, context: AppErrorContext): Promise<DiagnosticErrorRecord> {
  const serialized = serializeError(reason, context);
  const record: DiagnosticErrorRecord = {
    ...serialized,
    message: sanitizeDiagnosticText(serialized.message) ?? "Unknown error",
    stack: sanitizeDiagnosticText(serialized.stack),
    id: createId(),
    release: getReleaseInformation(),
    userAgent: navigator.userAgent,
    online: navigator.onLine
  };
  try {
    await idbPut("diagnostics", record);
    const all = await listDiagnosticErrors();
    for (const stale of all.slice(MAX_RECORDS)) await idbDelete("diagnostics", stale.id);
  } catch {
    // Diagnostics must never hide or replace the original failure.
  }
  return record;
}

export async function listDiagnosticErrors(): Promise<DiagnosticErrorRecord[]> {
  const records = await idbGetAll<DiagnosticErrorRecord>("diagnostics");
  return records
    .filter((record) => typeof record?.timestamp === "number" && typeof record?.message === "string")
    .sort((left, right) => right.timestamp - left.timestamp);
}

export async function clearDiagnosticErrors(): Promise<void> {
  const records = await listDiagnosticErrors();
  await Promise.all(records.map((record) => idbDelete("diagnostics", record.id)));
}

export function diagnosticReportBlob(records: DiagnosticErrorRecord[]): Blob {
  const report = {
    exportedAt: new Date().toISOString(),
    release: getReleaseInformation(),
    browser: navigator.userAgent,
    online: navigator.onLine,
    records
  };
  return new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
}

import type { ComplianceExportReport, ComplianceInspection, ComplianceOptions } from "../types/compliance";

type WorkerResponse =
  | { type: "COMPLIANCE_INSPECTION"; requestId: string; inspection: ComplianceInspection }
  | { type: "COMPLIANCE_RESULT"; requestId: string; output: ArrayBuffer; report: ComplianceExportReport }
  | { type: "COMPLIANCE_ERROR"; requestId: string; error: { message: string } };

async function loadSrgbProfile(): Promise<ArrayBuffer> {
  const url = `${import.meta.env.BASE_URL}color/srgb-artifex.icc`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The bundled sRGB output-intent profile could not be loaded (${response.status}).`);
  return response.arrayBuffer();
}

function call<T>(message: Record<string, unknown>, bytes: Uint8Array, password?: string, signal?: AbortSignal, extras: Transferable[] = []): Promise<T> {
  const worker = new Worker(new URL("../workers/compliance.worker.ts", import.meta.url), { type: "module" }), requestId = crypto.randomUUID(), input = Uint8Array.from(bytes).buffer;
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { worker.postMessage({ type: "CANCEL", requestId }); cleanup(); reject(new DOMException("Operation cancelled.", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "COMPLIANCE_ERROR") reject(new Error(event.data.error.message));
      else if (event.data.type === "COMPLIANCE_INSPECTION") resolve(event.data.inspection as T);
      else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report } as T);
    };
    worker.onerror = event => { cleanup(); reject(new Error(event.message || "Compliance worker failed.")); };
    worker.postMessage({ ...message, requestId, bytes: input, password }, [input, ...extras]);
  });
}

export function inspectCompliance(bytes: Uint8Array, password?: string, signal?: AbortSignal) {
  return call<ComplianceInspection>({ type: "INSPECT_COMPLIANCE" }, bytes, password, signal);
}

export async function applyCompliance(bytes: Uint8Array, options: ComplianceOptions, password?: string, signal?: AbortSignal) {
  const needsProfile = options.prepareArchival && options.archivalLevel !== "none" && options.addOutputIntent;
  const srgbProfile = needsProfile ? await loadSrgbProfile() : undefined;
  return call<{ bytes: Uint8Array; report: ComplianceExportReport }>(
    { type: "APPLY_COMPLIANCE", options, srgbProfile },
    bytes,
    password,
    signal,
    srgbProfile ? [srgbProfile] : []
  );
}

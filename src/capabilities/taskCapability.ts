import { readEditorState } from "../editor/editorRepository";
import { getProject, loadProjectBytes } from "../projects/projectRepository";
import { inspectSecurity } from "../security/securityClient";
import { readProjectSessionPassword } from "../security/sessionPasswords";
import type { PdfTask } from "../ia/taskCatalog";
import type { ProjectManifest } from "../types/project";

export type TaskSupportState =
  | "available"
  | "available-with-warning"
  | "experimental"
  | "unsupported-for-document"
  | "temporarily-unavailable"
  | "hidden";

export interface TaskCapability {
  state: TaskSupportState;
  label: string;
  reason?: string;
  recovery?: string;
  alternativeTaskId?: string;
}

export interface TaskSecurityEvidence {
  fillableFormFieldCount: number;
  redactionMarkCount: number;
  flattenableObjectCount: number;
}

export interface TaskCapabilityContext {
  project?: ProjectManifest;
  editorRedactionMarkCount: number;
  securityEvidence?: TaskSecurityEvidence;
  securityEvidenceChecked: boolean;
  runtime: {
    worker: boolean;
    webAssembly: boolean;
  };
}

export interface BuildTaskCapabilityContextOptions {
  inspectSecurity?: boolean;
  signal?: AbortSignal;
}

const AVAILABLE: TaskCapability = { state: "available", label: "Ready" };
const DOCUMENT_PREFLIGHT_TASKS = new Set(["fill-forms", "apply-redactions", "split-pdf", "flatten-pdf"]);
const SECURITY_WORKER_TASKS = new Set(["fill-forms", "apply-redactions", "sanitize-pdf", "password-protect", "flatten-pdf"]);
// Worker/WASM startup can exceed five seconds on cold CI/mobile-class devices.
// The Read workspace remains usable while this bounded check runs, so allow a
// realistic cold-start window without turning the gate into an indefinite wait.
const SECURITY_PREFLIGHT_TIMEOUT_MS = 15_000;

export function detectTaskCapabilityRuntime(): TaskCapabilityContext["runtime"] {
  return {
    worker: typeof Worker !== "undefined",
    webAssembly: typeof WebAssembly !== "undefined"
  };
}

export function createGenericTaskCapabilityContext(): TaskCapabilityContext {
  return {
    editorRedactionMarkCount: 0,
    securityEvidenceChecked: false,
    runtime: detectTaskCapabilityRuntime()
  };
}

export async function buildTaskCapabilityContext(
  projectId: string,
  options: BuildTaskCapabilityContextOptions = {}
): Promise<TaskCapabilityContext> {
  const [project, editorState] = await Promise.all([getProject(projectId), readEditorState(projectId)]);
  if (!project) throw new Error("Project not found.");

  const context: TaskCapabilityContext = {
    project,
    editorRedactionMarkCount: editorState.objects.filter((object) => object.type === "redaction" && !object.hidden).length,
    securityEvidenceChecked: false,
    runtime: detectTaskCapabilityRuntime()
  };

  if (options.inspectSecurity && context.runtime.worker && context.runtime.webAssembly) {
    const controller = new AbortController();
    const abortFromCaller = () => {
      if (!controller.signal.aborted) controller.abort(options.signal?.reason ?? new DOMException("Capability preflight cancelled.", "AbortError"));
    };
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener("abort", abortFromCaller, { once: true });

    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        if (!controller.signal.aborted) controller.abort(new DOMException("Document capability preflight timed out.", "TimeoutError"));
        reject(new DOMException("Document capability preflight timed out.", "TimeoutError"));
      }, SECURITY_PREFLIGHT_TIMEOUT_MS);
    });
    const cancellation = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) {
        reject(controller.signal.reason ?? new DOMException("Capability preflight cancelled.", "AbortError"));
        return;
      }
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason ?? new DOMException("Capability preflight cancelled.", "AbortError")), { once: true });
    });

    try {
      const bytes = await Promise.race([loadProjectBytes(project), deadline, cancellation]);
      const report = await Promise.race([
        inspectSecurity(bytes, readProjectSessionPassword(project.id), controller.signal),
        deadline,
        cancellation
      ]);
      const fillableFormFieldCount = report.formFields.filter((field) => !field.readOnly && field.type !== "signature" && field.type !== "button").length;
      const flattenableFormFieldCount = report.formFields.filter((field) => field.type !== "signature").length;
      context.securityEvidence = {
        fillableFormFieldCount,
        redactionMarkCount: report.redactionMarkCount,
        flattenableObjectCount: flattenableFormFieldCount + report.annotationCount
      };
      context.securityEvidenceChecked = true;
    } catch (reason) {
      // Deep inspection is a safety gate for task-specific destructive/protect routes.
      // If it cannot complete, fail closed instead of mounting a tool that may remain
      // stuck while repeating the same inspection. The caller converts this into a
      // temporary blocker, which is distinct from falsely claiming the PDF is unsupported.
      context.securityEvidenceChecked = false;
      throw reason;
    } finally {
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  return context;
}

export function evaluateTaskCapability(task: PdfTask, context: TaskCapabilityContext): TaskCapability {
  const project = context.project;

  if ((task.id === "ocr-pdf" || SECURITY_WORKER_TASKS.has(task.id)) && (!context.runtime.worker || !context.runtime.webAssembly)) {
    return {
      state: "temporarily-unavailable",
      label: "Unavailable right now",
      reason: `${task.label} needs Web Workers and WebAssembly, which are unavailable in this browser session.`,
      recovery: "Use a current Chromium, Firefox, or WebKit-based browser with WebAssembly enabled."
    };
  }

  if (task.id === "fill-forms" && project?.summary.formFieldCount === 0) {
    return {
      state: "unsupported-for-document",
      label: "Not available for this PDF",
      reason: "No supported interactive form fields were detected in this PDF.",
      recovery: "If the form is visually flat, use Edit to place ordinary text and marks instead.",
      alternativeTaskId: "edit-pdf"
    };
  }

  if (task.id === "fill-forms" && project && context.securityEvidenceChecked && context.securityEvidence?.fillableFormFieldCount === 0) {
    return {
      state: "unsupported-for-document",
      label: "No fillable fields",
      reason: "This PDF contains form widgets, but none are supported writable fields. They are read-only, signature/button fields, or otherwise non-fillable here.",
      recovery: "Use Edit for appearance-only text and marks, or choose a PDF with writable AcroForm fields.",
      alternativeTaskId: "edit-pdf"
    };
  }

  if (task.id === "split-pdf" && project && project.summary.pageCount < 2) {
    return {
      state: "unsupported-for-document",
      label: "Not available for this PDF",
      reason: "This PDF has only one page, so there is nothing to split into separate PDF parts.",
      recovery: "Choose a PDF with at least two pages."
    };
  }

  if (task.id === "apply-redactions" && project) {
    const knownMarks = context.editorRedactionMarkCount + (context.securityEvidence?.redactionMarkCount ?? 0);
    if (context.securityEvidenceChecked && knownMarks === 0) {
      return {
        state: "unsupported-for-document",
        label: "Nothing to redact yet",
        reason: "No saved editor redaction marks or existing PDF redaction annotations were found.",
        recovery: "Mark the areas to redact in Edit, then return to Apply permanent redactions.",
        alternativeTaskId: "mark-redaction"
      };
    }
    return {
      state: "available-with-warning",
      label: context.securityEvidenceChecked ? "Review first" : "Checked before opening",
      reason: knownMarks > 0
        ? `${knownMarks} redaction mark${knownMarks === 1 ? " is" : "s are"} available. Applying redactions permanently removes covered content from the new output.`
        : "PDF Studio will check the source PDF for existing redaction annotations before Protect starts. If none exist, mark areas in Edit first.",
      recovery: "The original PDF remains unchanged; permanent removal applies to the new output."
    };
  }

  if (task.id === "flatten-pdf" && project && context.securityEvidenceChecked && context.securityEvidence?.flattenableObjectCount === 0) {
    return {
      state: "unsupported-for-document",
      label: "Nothing to flatten",
      reason: "No supported non-signature form fields or page annotations were found in this PDF.",
      recovery: "Choose another Protect task or a PDF that contains forms or annotations."
    };
  }

  switch (task.id) {
    case "visual-signature":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "This places a visual signature appearance only. It is not a certificate-backed digital signature."
      };
    case "mark-redaction":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "A redaction mark is not permanent removal. Apply permanent redactions in Protect after marking the content."
      };
    case "apply-redactions":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "Permanent redaction removes covered content from the derived output after the marked regions are validated."
      };
    case "split-pdf":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "Split parts can no longer carry every whole-document structure or signature meaning exactly as the original PDF."
      };
    case "crop-pages":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "Cropping changes the visible CropBox. It does not securely erase content outside the cropped area."
      };
    case "sanitize-pdf":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "Sanitizing intentionally removes the document content you select, such as metadata, JavaScript, attachments, links, comments, or form values."
      };
    case "flatten-pdf":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "Flattening supported forms or annotations keeps their appearance but removes interactivity or editability from the new copy."
      };
    case "ocr-pdf":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "OCR creates a searchable raster reconstruction. It does not add an invisible text layer to the original page content."
      };
    case "grayscale-pdf":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "Grayscale output rasterizes pages and loses interactive structure such as searchable text, forms, links, layers, and signatures."
      };
    case "accessibility-check":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "PDF Studio can inspect accessibility and perform limited repairs, but it does not claim arbitrary PDF/UA remediation or certification."
      };
    case "print-layout":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "Imposition and booklet output can rebuild page structure and do not replace a full prepress, separations, bleed, or ICC workflow."
      };
    case "archive-readiness":
      return {
        state: "experimental",
        label: "Experimental",
        reason: "PDF/A readiness checks and candidate preparation are available, but PDF Studio does not provide certified PDF/A conformance."
      };
    case "repair-pdf":
      return {
        state: "available-with-warning",
        label: "Review first",
        reason: "Repair rewrites a separate clean copy and cannot guarantee recovery of every malformed or unsupported PDF structure."
      };
    default:
      return AVAILABLE;
  }
}

export function canStartTask(capability: TaskCapability): boolean {
  return capability.state === "available"
    || capability.state === "available-with-warning"
    || capability.state === "experimental";
}

export function isCapabilityBlocked(capability: TaskCapability): boolean {
  return !canStartTask(capability) && capability.state !== "hidden";
}

export function shouldShowCapability(capability: TaskCapability): boolean {
  return capability.state !== "available" && capability.state !== "hidden";
}

export function taskNeedsDocumentPreflight(task: PdfTask): boolean {
  return DOCUMENT_PREFLIGHT_TASKS.has(task.id);
}

export function taskNeedsDeepSecurityInspection(task: PdfTask): boolean {
  return task.id === "apply-redactions" || task.id === "fill-forms" || task.id === "flatten-pdf";
}

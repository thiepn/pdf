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

export interface TaskCapabilityContext {
  project?: ProjectManifest;
  editorRedactionMarkCount: number;
  sourceRedactionMarkCount?: number;
  sourceRedactionsChecked: boolean;
  runtime: {
    worker: boolean;
    webAssembly: boolean;
  };
}

export interface BuildTaskCapabilityContextOptions {
  inspectSourceRedactions?: boolean;
}

const AVAILABLE: TaskCapability = { state: "available", label: "Ready" };
const DOCUMENT_PREFLIGHT_TASKS = new Set(["fill-forms", "apply-redactions", "split-pdf"]);

export function detectTaskCapabilityRuntime(): TaskCapabilityContext["runtime"] {
  return {
    worker: typeof Worker !== "undefined",
    webAssembly: typeof WebAssembly !== "undefined"
  };
}

export function createGenericTaskCapabilityContext(): TaskCapabilityContext {
  return {
    editorRedactionMarkCount: 0,
    sourceRedactionsChecked: false,
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
    sourceRedactionsChecked: false,
    runtime: detectTaskCapabilityRuntime()
  };

  if (options.inspectSourceRedactions && context.runtime.worker) {
    try {
      const bytes = await loadProjectBytes(project);
      const report = await inspectSecurity(bytes, readProjectSessionPassword(project.id));
      context.sourceRedactionMarkCount = report.redactionMarkCount;
      context.sourceRedactionsChecked = true;
    } catch {
      // Protected or temporarily unreadable documents are re-checked in Protect.
      // An inconclusive preflight must never become a false unsupported claim.
      context.sourceRedactionsChecked = false;
    }
  }

  return context;
}

export function evaluateTaskCapability(task: PdfTask, context: TaskCapabilityContext): TaskCapability {
  const project = context.project;

  if (task.id === "ocr-pdf" && (!context.runtime.worker || !context.runtime.webAssembly)) {
    return {
      state: "temporarily-unavailable",
      label: "Unavailable right now",
      reason: "OCR needs Web Workers and WebAssembly, which are unavailable in this browser session.",
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

  if (task.id === "split-pdf" && project && project.summary.pageCount < 2) {
    return {
      state: "unsupported-for-document",
      label: "Not available for this PDF",
      reason: "This PDF has only one page, so there is nothing to split into separate PDF parts.",
      recovery: "Choose a PDF with at least two pages."
    };
  }

  if (task.id === "apply-redactions" && project) {
    const knownMarks = context.editorRedactionMarkCount + (context.sourceRedactionMarkCount ?? 0);
    if (context.sourceRedactionsChecked && knownMarks === 0) {
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
      label: context.sourceRedactionsChecked ? "Review first" : "Checked before opening",
      reason: knownMarks > 0
        ? `${knownMarks} redaction mark${knownMarks === 1 ? " is" : "s are"} available. Applying redactions permanently removes covered content from the new output.`
        : "PDF Studio will check the source PDF for existing redaction annotations before Protect starts. If none exist, mark areas in Edit first.",
      recovery: "The original PDF remains unchanged; permanent removal applies to the new output."
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

export function taskNeedsSourceRedactionInspection(task: PdfTask): boolean {
  return task.id === "apply-redactions";
}

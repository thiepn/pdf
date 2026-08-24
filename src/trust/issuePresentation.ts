export type UserIssueCategory =
  | "user-action"
  | "document-limitation"
  | "browser-limitation"
  | "resource-limitation"
  | "cancelled"
  | "product-defect";

export interface IssuePresentationOptions {
  action?: string;
  recovery?: string;
  originalSafe?: boolean;
  outputReleased?: boolean;
}

export interface UserIssuePresentation {
  category: UserIssueCategory;
  label: string;
  title: string;
  summary: string;
  recovery: string;
  originalSafe: boolean;
  outputReleased?: boolean;
  technicalDetails?: string;
}

const CATEGORY_LABELS: Record<UserIssueCategory, string> = {
  "user-action": "Needs your attention",
  "document-limitation": "PDF limitation",
  "browser-limitation": "Browser limitation",
  "resource-limitation": "Device resource limit",
  cancelled: "Cancelled",
  "product-defect": "Unexpected problem"
};

function rawMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return typeof reason === "string" ? reason : String(reason);
}

function actionTitle(action: string | undefined, fallback: string): string {
  return action ? `${action} could not finish` : fallback;
}

export function classifyIssue(reason: unknown): UserIssueCategory {
  const message = rawMessage(reason).toLowerCase();
  if ((reason instanceof DOMException && reason.name === "AbortError") || /\bcancel(?:led|ed|ation)?\b/.test(message)) return "cancelled";
  if (/quota|storage (?:space|budget|headroom)|not enough (?:local )?storage|insufficient (?:local )?storage|out of memory|memory limit|too large for (?:this )?browser/.test(message)) return "resource-limitation";
  if (/service worker|webassembly|web assembly|web lock|navigator\.locks|worker is unavailable|workers are unavailable|browser does not support|browser cannot|clipboard api|file system access/.test(message)) return "browser-limitation";
  if (/unsupported|not supported|xfa|malformed|damaged pdf|corrupt pdf|complex script|font.*(?:missing|unsupported)|signature.*(?:invalid|unsupported)|document.*(?:cannot|can't).*handle/.test(message)) return "document-limitation";
  if (/password|choose |select |enter |required|does not match|no redaction|no pages|no supported interactive form|mark.*first|nothing to /.test(message)) return "user-action";
  return "product-defect";
}

export function presentIssue(reason: unknown, options: IssuePresentationOptions = {}): UserIssuePresentation {
  const category = classifyIssue(reason);
  const technicalDetails = rawMessage(reason).trim() || undefined;
  const originalSafe = options.originalSafe !== false;

  const base: Record<UserIssueCategory, Omit<UserIssuePresentation, "category" | "label" | "technicalDetails" | "originalSafe" | "outputReleased">> = {
    "user-action": {
      title: actionTitle(options.action, "This action needs more information"),
      summary: "PDF Studio stopped before making an uncertain change because this action needs something from you.",
      recovery: options.recovery ?? "Review the highlighted requirement, correct it, and try the action again."
    },
    "document-limitation": {
      title: actionTitle(options.action, "This PDF cannot be handled safely by this task"),
      summary: "This PDF uses content or structure that the current task cannot safely preserve or process.",
      recovery: options.recovery ?? "Choose a supported alternative when one is offered, or keep the original PDF and use a specialist tool for this document."
    },
    "browser-limitation": {
      title: actionTitle(options.action, "This browser is missing a required capability"),
      summary: "The task needs a browser feature that is unavailable or blocked in the current environment.",
      recovery: options.recovery ?? "Retry after reloading. If the limitation remains, use a current desktop browser with the required capability enabled."
    },
    "resource-limitation": {
      title: actionTitle(options.action, "The device does not have enough local resources"),
      summary: "PDF Studio stopped before committing the result because the browser could not safely reserve enough local storage or memory.",
      recovery: options.recovery ?? "Free local storage, close other large documents or tabs, then retry. Important projects should be backed up before clearing browser data."
    },
    cancelled: {
      title: options.action ? `${options.action} was cancelled` : "Operation cancelled",
      summary: "The operation stopped before a new result was committed.",
      recovery: options.recovery ?? "You can start the action again when ready."
    },
    "product-defect": {
      title: actionTitle(options.action, "PDF Studio hit an unexpected problem"),
      summary: "PDF Studio stopped this action instead of releasing a result it could not verify.",
      recovery: options.recovery ?? "Retry once. If the same problem returns, open Troubleshooting & recovery or Diagnostics and use the technical details when reporting the issue."
    }
  };

  return {
    category,
    label: CATEGORY_LABELS[category],
    ...base[category],
    originalSafe,
    outputReleased: options.outputReleased,
    technicalDetails
  };
}

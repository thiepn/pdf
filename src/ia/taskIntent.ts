export interface TaskIntentActivation {
  selector: string;
  label: string;
}

const TASK_INTENT_ACTIVATIONS: Record<string, TaskIntentActivation> = {
  "edit-pdf": { selector: ".editor-toolrail button", label: "Select" },
  "annotate-pdf": { selector: ".editor-toolrail button", label: "Highlight" },
  "visual-signature": { selector: ".editor-toolrail button", label: "Signature" },
  "mark-redaction": { selector: ".editor-toolrail button", label: "Mark redaction" },
  "fill-forms": { selector: ".security-tabs button", label: "Forms" },
  "apply-redactions": { selector: ".security-tabs button", label: "Redaction" },
  "sanitize-pdf": { selector: ".security-tabs button", label: "Sanitize" },
  "password-protect": { selector: ".security-tabs button", label: "Protect" },
  "flatten-pdf": { selector: ".security-tabs button", label: "Sanitize" },
  "print-layout": { selector: ".professional-tabs button", label: "Print layout" },
  "bates-numbering": { selector: ".professional-tabs button", label: "Document numbering" },
  "archive-readiness": { selector: ".professional-tabs button", label: "Archive check" },
  "accessibility-check": { selector: ".professional-tabs button", label: "Accessibility" }
};

export function taskIntentActivation(taskId?: string): TaskIntentActivation | undefined {
  return taskId ? TASK_INTENT_ACTIVATIONS[taskId] : undefined;
}

export function taskIntentActivationIds(): string[] {
  return Object.keys(TASK_INTENT_ACTIVATIONS);
}

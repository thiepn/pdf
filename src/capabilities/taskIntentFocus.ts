export interface TaskIntentFocusTarget {
  selector: string;
  label?: string;
  action?: "click" | "focus";
}

export interface TaskIntentFocusPlan {
  primary: TaskIntentFocusTarget;
  followUp?: TaskIntentFocusTarget;
}

/**
 * Some canonical tasks share a broader implementation workspace. This contract
 * records the exact control that must become active after that workspace mounts
 * so task links never strand the user on an unrelated default tab/tool.
 */
export const TASK_INTENT_FOCUS_PLANS: Readonly<Record<string, TaskIntentFocusPlan>> = {
  "edit-pdf": { primary: { selector: '.editor-toolrail button[aria-label="Select"]' } },
  "annotate-pdf": { primary: { selector: '.editor-toolrail button[aria-label="Highlight"]' } },
  "visual-signature": { primary: { selector: '.editor-toolrail button[aria-label="Signature"]' } },
  "mark-redaction": { primary: { selector: '.editor-toolrail button[aria-label="Mark redaction"]' } },

  "fill-forms": { primary: { selector: ".security-tabs button", label: "Forms" } },
  "apply-redactions": { primary: { selector: ".security-tabs button", label: "Redaction" } },
  "sanitize-pdf": { primary: { selector: ".security-tabs button", label: "Sanitize" } },
  "password-protect": { primary: { selector: ".security-tabs button", label: "Protect" } },
  "flatten-pdf": {
    primary: { selector: ".security-tabs button", label: "Sanitize" },
    followUp: { selector: ".security-option-list label", label: "Flatten form fields", action: "focus" }
  },

  "accessibility-check": { primary: { selector: ".compliance-page .professional-tabs button", label: "Accessibility" } },
  "print-layout": { primary: { selector: ".professional-page .professional-tabs button", label: "Print layout" } },
  "bates-numbering": { primary: { selector: ".professional-page .professional-tabs button", label: "Document numbering" } },
  "archive-readiness": { primary: { selector: ".professional-page .professional-tabs button", label: "Archive check" } }
};

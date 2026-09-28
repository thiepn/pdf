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
  "edit-pdf": { primary: { selector: '.editing-toolbar button[aria-label="Select"]' } },
  "annotate-pdf": { primary: { selector: '.editing-toolbar button[aria-label="Highlight"]' } },
  "visual-signature": { primary: { selector: '.editing-toolbar button[aria-label="Signature"]' } },
  "mark-redaction": { primary: { selector: '.editing-toolbar button[aria-label="More tools"]' }, followUp: { selector: '.editor-tools-sheet button[aria-label="Mark redaction"]' } },

  "fill-forms": { primary: { selector: '.security-task-workflow[data-security-task="forms"] .security-panel', action: "focus" } },
  "apply-redactions": { primary: { selector: '.security-task-workflow[data-security-task="redaction"] .security-panel', action: "focus" } },
  "sanitize-pdf": { primary: { selector: '.security-task-workflow[data-security-task="sanitize"] .security-panel', action: "focus" } },
  "password-protect": { primary: { selector: '.security-task-workflow[data-security-task="protect"] .security-panel', action: "focus" } },
  "flatten-pdf": {
    primary: { selector: '.security-task-workflow[data-security-task="sanitize"] .security-panel', action: "focus" },
    followUp: { selector: ".security-option-list label", label: "Flatten form fields", action: "focus" }
  },

  "accessibility-check": { primary: { selector: ".compliance-page .professional-tabs button", label: "Accessibility" } },
  "print-layout": { primary: { selector: ".professional-page .professional-tabs button", label: "Print layout" } },
  "bates-numbering": { primary: { selector: ".professional-page .professional-tabs button", label: "Document numbering" } },
  "archive-readiness": { primary: { selector: ".professional-page .professional-tabs button", label: "Archive check" } }
};

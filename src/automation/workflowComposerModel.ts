import { actionFromBatchStep, getHeadlessAction, planHeadlessActions, type ActionPlan, type ActionRisk } from "../actions/actionCatalog";
import { batchRecipeExecutionFingerprint, defaultBatchStep } from "../processing/batchModel";
import type { BatchRecipe, BatchStep } from "../types/batch";

export const F6_MAX_STEPS = 32;
export const F6_MAX_FILES = 100;
export type WorkflowFailurePolicy = "continue" | "stop";
export interface WorkflowPreflight {
  valid: boolean;
  errors: string[];
  warnings: string[];
  plan: ActionPlan | null;
  risks: ActionRisk[];
  terminal: boolean;
  fingerprint: string;
}

export function terminalStep(step: BatchStep): boolean {
  return step.type === "split-fixed" || step.type === "page-images";
}
/** Reorder by stable IDs for drag-and-drop and keyboard controls. */
export function reorderWorkflowSteps(steps: readonly BatchStep[], sourceId: string, beforeId: string | null): BatchStep[] {
  const source = steps.findIndex(step => step.id === sourceId);
  if (source === -1) return [...steps];
  if (beforeId === sourceId) return [...steps];
  const clone = [...steps];
  const [moving] = clone.splice(source, 1);
  const index = beforeId === null ? clone.length : clone.findIndex(step => step.id === beforeId);
  if (index === -1) return [...steps];
  clone.splice(index, 0, moving);
  if (clone.some((step, position) => terminalStep(step) && position !== clone.length - 1)) return [...steps];
  return clone;
}
export function addWorkflowStep(steps: readonly BatchStep[], type: BatchStep["type"], id?: string): BatchStep[] {
  if (steps.length >= F6_MAX_STEPS) throw new Error("A workflow can contain at most 32 actions.");
  const next = defaultBatchStep(type, id);
  if (terminalStep(next)) return [...steps.filter(step => !terminalStep(step)), next];
  const position = steps.findIndex(terminalStep);
  const output = [...steps];
  output.splice(position === -1 ? output.length : position, 0, next);
  return output;
}
export function duplicateWorkflowStep(steps: readonly BatchStep[], sourceId: string, nextId: string): BatchStep[] {
  if (steps.length >= F6_MAX_STEPS) throw new Error("A workflow can contain at most 32 actions.");
  const position = steps.findIndex(step => step.id === sourceId);
  if (position === -1) return [...steps];
  const item = steps[position];
  if (terminalStep(item)) throw new Error("Terminal exports cannot be duplicated.");
  const next = [...steps];
  next.splice(position + 1, 0, {...item, id: nextId});
  return next;
}
export function validateWorkflowDraft(recipe: BatchRecipe): WorkflowPreflight {
  const errors: string[] = [];
  const warnings: string[] = [];
  let plan: ActionPlan | null = null;
  if (!recipe.steps.length) errors.push("Add at least one action.");
  if (recipe.steps.length > F6_MAX_STEPS) errors.push("A workflow may contain at most 32 actions.");
  if (new Set(recipe.steps.map(step => step.id)).size !== recipe.steps.length) errors.push("Step IDs must be unique.");
  const fingerprint = batchRecipeExecutionFingerprint(recipe);
  if (!errors.length) {
    try { plan = planHeadlessActions(recipe.steps.map(actionFromBatchStep)); }
    catch (reason) { errors.push(reason instanceof Error ? reason.message : String(reason)); }
  }
  if (plan) {
    if (plan.requiredRisks.includes("rasterization")) warnings.push("Rasterization removes searchable text, vectors, editable forms, annotations and interactive links from the output.");
    if (plan.requiredRisks.includes("metadata-removal")) warnings.push("Document metadata is intentionally removed. Review the result before distributing it.");
    if (plan.actions.some(item => item.id === "pdf.rotate")) warnings.push("Page-assembly operations can affect advanced navigation, interactive forms and digital signatures.");
    if (plan.actions.some(item => item.id === "pdf.optimize")) warnings.push("Legacy native compression is not an F4 all-structure preservation certification.");
    if (plan.actions.some(item => item.terminal)) warnings.push("The final action exports a ZIP. Subsequent PDF operations are not possible in this workflow.");
  }
  return {
    valid:errors.length === 0 && plan !== null,
    errors,warnings,plan,risks:plan?.requiredRisks ?? [],
    terminal:plan?.actions.at(-1)?.terminal ?? false,
    fingerprint
  };
}
export interface WorkflowRunEvidence {
  version: 1;
  recipeName: string;
  fingerprint: string;
  failurePolicy: WorkflowFailurePolicy;
  startedAt: string;
  completedAt: string;
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  entries: Array<{name: string; status: string; bytesIn: number; bytesOut: number | null; error?: string}>;
}
export function createWorkflowRunEvidence(input: Omit<WorkflowRunEvidence, "version"|"total"|"succeeded"|"failed"|"cancelled">): WorkflowRunEvidence {
  return {
    version:1,...input,total:input.entries.length,
    succeeded:input.entries.filter(entry => entry.status === "complete").length,
    failed:input.entries.filter(entry => entry.status === "failed").length,
    cancelled:input.entries.filter(entry => entry.status === "cancelled").length
  };
}

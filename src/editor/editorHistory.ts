import type { EditorHistoryEntry, EditorHistoryState, EditorObject } from "../types/editor";
import { cloneObjects } from "./editorModel";

function entry(label: string, objects: EditorObject[], selectedIds: Iterable<string>, mergeKey?: string): EditorHistoryEntry {
  return { label, objects: cloneObjects(objects), selectedIds: [...selectedIds], timestamp: Date.now(), mergeKey };
}

export function createHistory(objects: EditorObject[] = []): EditorHistoryState {
  return { past: [], present: entry("Initial state", objects, []), future: [] };
}

export function commitHistory(
  state: EditorHistoryState,
  label: string,
  objects: EditorObject[],
  selectedIds: Iterable<string>,
  mergeKey?: string
): EditorHistoryState {
  const next = entry(label, objects, selectedIds, mergeKey);
  const canMerge = mergeKey && state.present.mergeKey === mergeKey && next.timestamp - state.present.timestamp < 800;
  if (canMerge) return { ...state, present: next, future: [] };
  return { past: [...state.past.slice(-79), state.present], present: next, future: [] };
}

export function undoHistory(state: EditorHistoryState): EditorHistoryState {
  const previous = state.past.at(-1);
  if (!previous) return state;
  return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
}

export function redoHistory(state: EditorHistoryState): EditorHistoryState {
  const next = state.future[0];
  if (!next) return state;
  return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
}

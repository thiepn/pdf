import type { EditorHistoryEntry, EditorHistoryState, EditorObject } from "../types/editor";
import type { NativeEdit } from "../types/nativeEditor";
import { cloneObjects } from "./editorModel";

function cloneNativeEdits(edits: NativeEdit[]): NativeEdit[] {
  // Native edit payloads are immutable after they enter history. Keep the edit
  // objects (and potentially large embedded font bytes) structurally shared
  // while snapshotting the array itself for Undo/Redo isolation.
  return edits.slice();
}

function entry(
  label: string,
  objects: EditorObject[],
  nativeEdits: NativeEdit[],
  selectedIds: Iterable<string>,
  selectedNativeIds: Iterable<string> = [],
  selectedNativeId?: string,
  mergeKey?: string
): EditorHistoryEntry {
  const nativeSelection = [...selectedNativeIds];
  return {
    label,
    objects: cloneObjects(objects),
    nativeEdits: cloneNativeEdits(nativeEdits),
    selectedIds: [...selectedIds],
    selectedNativeIds: nativeSelection,
    selectedNativeId: selectedNativeId && nativeSelection.includes(selectedNativeId) ? selectedNativeId : nativeSelection[0],
    timestamp: Date.now(),
    mergeKey
  };
}

export function createHistory(objects: EditorObject[] = [], nativeEdits: NativeEdit[] = []): EditorHistoryState {
  return { past: [], present: entry("Initial state", objects, nativeEdits, []), future: [] };
}

export function withHistorySelection(
  state: EditorHistoryState,
  selectedIds: Iterable<string>,
  selectedNativeIds: Iterable<string> = [],
  selectedNativeId?: string
): EditorHistoryState {
  const nativeSelection = [...selectedNativeIds];
  return {
    ...state,
    present: {
      ...state.present,
      selectedIds: [...selectedIds],
      selectedNativeIds: nativeSelection,
      selectedNativeId: selectedNativeId && nativeSelection.includes(selectedNativeId) ? selectedNativeId : nativeSelection[0]
    }
  };
}

export function commitHistory(
  state: EditorHistoryState,
  label: string,
  objects: EditorObject[],
  selectedIds: Iterable<string>,
  mergeKey?: string,
  nativeEdits: NativeEdit[] = state.present.nativeEdits,
  selectedNativeIds: Iterable<string> = state.present.selectedNativeIds,
  selectedNativeId: string | undefined = state.present.selectedNativeId
): EditorHistoryState {
  const next = entry(label, objects, nativeEdits, selectedIds, selectedNativeIds, selectedNativeId, mergeKey);
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

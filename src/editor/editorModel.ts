import type { Rect } from "../core/coordinates";
import { EDITOR_SCHEMA_VERSION, type EditorDocumentState, type EditorObject, type EditorTool } from "../types/editor";

function id(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEditorState(projectId: string): EditorDocumentState {
  return {
    schemaVersion: EDITOR_SCHEMA_VERSION,
    projectId,
    objects: [],
    currentPage: 1,
    zoom: 1,
    activeTool: "select",
    author: "PDF Studio user",
    gridSize: 8,
    snapEnabled: true,
    showGuides: true,
    dirty: false,
    updatedAt: Date.now()
  };
}

export function normalizeRect(rect: Rect, minimum = 2): Rect {
  const x0 = Math.min(rect.x0, rect.x1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const y1 = Math.max(rect.y0, rect.y1);
  return {
    x0,
    y0,
    x1: x1 - x0 < minimum ? x0 + minimum : x1,
    y1: y1 - y0 < minimum ? y0 + minimum : y1
  };
}

export function rectWidth(rect: Rect): number { return rect.x1 - rect.x0; }
export function rectHeight(rect: Rect): number { return rect.y1 - rect.y0; }

export function moveRect(rect: Rect, dx: number, dy: number): Rect {
  return { x0: rect.x0 + dx, y0: rect.y0 + dy, x1: rect.x1 + dx, y1: rect.y1 + dy };
}

export function clampRect(rect: Rect, page: Rect): Rect {
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  const x0 = Math.max(page.x0, Math.min(page.x1 - width, rect.x0));
  const y0 = Math.max(page.y0, Math.min(page.y1 - height, rect.y0));
  return { x0, y0, x1: x0 + width, y1: y0 + height };
}

export interface SnapResult {
  rect: Rect;
  guides: Array<{ axis: "x" | "y"; value: number }>;
}

export function snapRect(rect: Rect, page: Rect, gridSize: number, enabled: boolean): SnapResult {
  if (!enabled) return { rect, guides: [] };
  const tolerance = 5;
  const width = rectWidth(rect);
  const height = rectHeight(rect);
  let x0 = Math.round(rect.x0 / gridSize) * gridSize;
  let y0 = Math.round(rect.y0 / gridSize) * gridSize;
  const guides: SnapResult["guides"] = [];
  const pageCenterX = (page.x0 + page.x1) / 2;
  const pageCenterY = (page.y0 + page.y1) / 2;
  const objectCenterX = x0 + width / 2;
  const objectCenterY = y0 + height / 2;

  if (Math.abs(rect.x0 - page.x0) <= tolerance) { x0 = page.x0; guides.push({ axis: "x", value: page.x0 }); }
  else if (Math.abs(rect.x1 - page.x1) <= tolerance) { x0 = page.x1 - width; guides.push({ axis: "x", value: page.x1 }); }
  else if (Math.abs(objectCenterX - pageCenterX) <= tolerance) { x0 = pageCenterX - width / 2; guides.push({ axis: "x", value: pageCenterX }); }

  if (Math.abs(rect.y0 - page.y0) <= tolerance) { y0 = page.y0; guides.push({ axis: "y", value: page.y0 }); }
  else if (Math.abs(rect.y1 - page.y1) <= tolerance) { y0 = page.y1 - height; guides.push({ axis: "y", value: page.y1 }); }
  else if (Math.abs(objectCenterY - pageCenterY) <= tolerance) { y0 = pageCenterY - height / 2; guides.push({ axis: "y", value: pageCenterY }); }

  return { rect: clampRect({ x0, y0, x1: x0 + width, y1: y0 + height }, page), guides };
}

interface NewObjectOptions {
  tool: EditorTool;
  pageNumber: number;
  bounds: Rect;
  author: string;
  zIndex: number;
}

export function createObjectForTool({ tool, pageNumber, bounds, author, zIndex }: NewObjectOptions): EditorObject | null {
  const now = Date.now();
  const base = {
    id: id(),
    pageNumber,
    bounds: normalizeRect(bounds),
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    hidden: false,
    createdAt: now,
    modifiedAt: now
  };
  switch (tool) {
    case "text": return { ...base, type: "text", text: "Type here", fontFamily: "Helvetica", fontSize: 16, fontWeight: "normal", fontStyle: "normal", textAlign: "left", color: "#16191d", backgroundColor: "#ffffff00", borderColor: "#00000000", borderWidth: 0, lineHeight: 1.2, padding: 4 };
    case "rectangle": return { ...base, type: "shape", shape: "rectangle", strokeColor: "#265d9b", fillColor: "#dcecff55", strokeWidth: 2, dash: "solid" };
    case "ellipse": return { ...base, type: "shape", shape: "ellipse", strokeColor: "#265d9b", fillColor: "#dcecff55", strokeWidth: 2, dash: "solid" };
    case "line": return { ...base, type: "shape", shape: "line", strokeColor: "#265d9b", fillColor: "#00000000", strokeWidth: 2, dash: "solid" };
    case "arrow": return { ...base, type: "shape", shape: "arrow", strokeColor: "#265d9b", fillColor: "#00000000", strokeWidth: 2, dash: "solid" };
    case "highlight": return { ...base, type: "highlight", style: "highlight", color: "#ffe04b" };
    case "underline": return { ...base, type: "highlight", style: "underline", color: "#2c6fb7" };
    case "strikeout": return { ...base, type: "highlight", style: "strikeout", color: "#c13d36" };
    case "squiggly": return { ...base, type: "highlight", style: "squiggly", color: "#d07020" };
    case "note": return { ...base, type: "note", author, subject: "Comment", contents: "Add a comment", color: "#ffd54f", resolved: false };
    case "link": return { ...base, type: "link", targetType: "url", target: "https://", borderColor: "#2878d0", borderWidth: 1 };
    case "stamp": return { ...base, type: "stamp", label: "APPROVED", color: "#167044", backgroundColor: "#e6f6ed", borderColor: "#167044" };
    case "signature": return { ...base, type: "signature", signerName: author, reason: "", location: "", signedAt: now, color: "#17233c", showDate: true, showLabels: false };
    case "redaction": return { ...base, type: "redaction", fillColor: "#000000", overlayText: "REDACTED", applied: false };
    default: return null;
  }
}

export function cloneObjects(objects: EditorObject[]): EditorObject[] {
  return structuredClone(objects);
}

export function duplicateObjects(objects: EditorObject[], ids: Set<string>, offset = 12): EditorObject[] {
  const now = Date.now();
  const highest = objects.reduce((max, object) => Math.max(max, object.zIndex), 0);
  const groupIds = new Map<string, string>();
  let index = 0;
  const copies = objects.filter((object) => ids.has(object.id)).map((object) => {
    const groupId = object.groupId ? groupIds.get(object.groupId) ?? (() => { const value = id(); groupIds.set(object.groupId as string, value); return value; })() : undefined;
    return {
      ...structuredClone(object),
      id: id(),
      groupId,
      bounds: moveRect(object.bounds, offset, -offset),
      zIndex: highest + ++index,
      createdAt: now,
      modifiedAt: now
    };
  });
  return [...objects, ...copies];
}

export function updateObjects(objects: EditorObject[], ids: Set<string>, updater: (object: EditorObject) => EditorObject): EditorObject[] {
  const now = Date.now();
  return objects.map((object) => ids.has(object.id) ? { ...updater(structuredClone(object)), modifiedAt: now } : object);
}

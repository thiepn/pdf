import type { Rect } from "../core/coordinates";

export const EDITOR_SCHEMA_VERSION = 3;

export type EditorTool =
  | "select"
  | "hand"
  | "text"
  | "image"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "pen"
  | "highlight"
  | "underline"
  | "strikeout"
  | "squiggly"
  | "note"
  | "link"
  | "stamp"
  | "signature"
  | "redaction";

export type EditorObjectType =
  | "text"
  | "image"
  | "shape"
  | "ink"
  | "highlight"
  | "note"
  | "link"
  | "stamp"
  | "signature"
  | "redaction";

export interface BaseEditorObject {
  id: string;
  type: EditorObjectType;
  pageNumber: number;
  bounds: Rect;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  createdAt: number;
  modifiedAt: number;
  groupId?: string;
}

export interface TextEditorObject extends BaseEditorObject {
  type: "text";
  text: string;
  fontFamily: "Helvetica" | "Times-Roman" | "Courier";
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  color: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  lineHeight: number;
  padding: number;
}

export interface ImageEditorObject extends BaseEditorObject {
  type: "image";
  assetId: string;
  name: string;
  mimeType: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  preserveAspectRatio: boolean;
  altText: string;
}

export interface ShapeEditorObject extends BaseEditorObject {
  type: "shape";
  shape: "rectangle" | "ellipse" | "line" | "arrow";
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  dash: "solid" | "dashed" | "dotted";
}

export interface InkPoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface InkEditorObject extends BaseEditorObject {
  type: "ink";
  strokes: InkPoint[][];
  color: string;
  strokeWidth: number;
  highlighter: boolean;
}

export interface HighlightEditorObject extends BaseEditorObject {
  type: "highlight";
  style: "highlight" | "underline" | "strikeout" | "squiggly";
  color: string;
}

export interface NoteEditorObject extends BaseEditorObject {
  type: "note";
  author: string;
  subject: string;
  contents: string;
  color: string;
  resolved: boolean;
}

export interface LinkEditorObject extends BaseEditorObject {
  type: "link";
  targetType: "url" | "page" | "email";
  target: string;
  borderColor: string;
  borderWidth: number;
}

export interface StampEditorObject extends BaseEditorObject {
  type: "stamp";
  label: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
}

export interface SignatureEditorObject extends BaseEditorObject {
  type: "signature";
  signerName: string;
  reason: string;
  location: string;
  signedAt: number;
  color: string;
  showDate: boolean;
  showLabels: boolean;
}

export interface RedactionEditorObject extends BaseEditorObject {
  type: "redaction";
  fillColor: string;
  overlayText: string;
  applied: false;
}

export type EditorObject =
  | TextEditorObject
  | ImageEditorObject
  | ShapeEditorObject
  | InkEditorObject
  | HighlightEditorObject
  | NoteEditorObject
  | LinkEditorObject
  | StampEditorObject
  | SignatureEditorObject
  | RedactionEditorObject;

export interface EditorDocumentState {
  schemaVersion: number;
  projectId: string;
  objects: EditorObject[];
  currentPage: number;
  zoom: number;
  activeTool: EditorTool;
  author: string;
  gridSize: number;
  snapEnabled: boolean;
  showGuides: boolean;
  dirty: boolean;
  updatedAt: number;
  lastSavedAt?: number;
}

export interface EditorAssetRecord {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  byteLength: number;
  bytes: ArrayBuffer;
  createdAt: number;
}

export interface EditorHistoryEntry {
  label: string;
  objects: EditorObject[];
  selectedIds: string[];
  timestamp: number;
  mergeKey?: string;
}

export interface EditorHistoryState {
  past: EditorHistoryEntry[];
  present: EditorHistoryEntry;
  future: EditorHistoryEntry[];
}

export interface EditorExportAsset {
  id: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

export interface EditorExportReport {
  objectCount: number;
  annotationCount: number;
  linkCount: number;
  imageCount: number;
  pageCount: number;
  outputBytes: number;
  durationMs: number;
  warnings: string[];
}

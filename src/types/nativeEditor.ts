export const NATIVE_EDITOR_SCHEMA_VERSION = 2;

export interface NativeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NativeScript = "latin" | "cjk-ko" | "cjk-ja" | "cjk-zh-hans" | "cjk-zh-hant" | "complex" | "unknown";
export type NativeEditability = "fixed-box" | "cjk-fixed-box" | "overlay-only" | "unsupported";
export type NativeCapabilityLevel = "native-safe" | "safe-reconstruction" | "appearance-only" | "unsupported";

export interface NativeCapability {
  level: NativeCapabilityLevel;
  label: string;
  confidence: number;
  reason: string;
  preserves: string[];
  risks: string[];
}

export interface NativeTextObject {
  id: string;
  type: "text";
  pageNumber: number;
  bounds: NativeRect;
  text: string;
  fontName: string;
  family: "serif" | "sans-serif" | "monospace";
  size: number;
  weight: "normal" | "bold";
  style: "normal" | "italic";
  writingMode: 0 | 1;
  script: NativeScript;
  editability: NativeEditability;
  reason: string;
  capability: NativeCapability;
}

export interface NativeImageObject {
  id: string;
  type: "image";
  pageNumber: number;
  bounds: NativeRect;
  width?: number;
  height?: number;
  editability: "replace-region";
  capability: NativeCapability;
}

export type NativePathCommand =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number }
  | { op: "Z" };

export interface NativeVectorObject {
  id: string;
  type: "vector";
  pageNumber: number;
  bounds: NativeRect;
  commands: NativePathCommand[];
  paint: "fill" | "stroke" | "fill-stroke";
  fillColor?: string;
  strokeColor?: string;
  lineWidth: number;
  alpha: number;
  evenOdd: boolean;
  editability: "region-rebuild";
  capability: NativeCapability;
}

export interface NativeTableCell {
  id: string;
  row: number;
  column: number;
  text: string;
  bounds: NativeRect;
  fontSize?: number;
}

export interface NativeTableObject {
  id: string;
  type: "table";
  pageNumber: number;
  bounds: NativeRect;
  rows: number;
  columns: number;
  cells: NativeTableCell[];
  confidence: number;
  editability: "cell-replace";
  capability: NativeCapability;
}

export type NativeFormFieldType = "button" | "checkbox" | "combobox" | "listbox" | "radiobutton" | "signature" | "text" | "unknown";

export interface NativeFormObject {
  id: string;
  type: "form";
  pageNumber: number;
  bounds: NativeRect;
  widgetIndex: number;
  fieldType: NativeFormFieldType;
  name: string;
  label: string;
  value: string;
  options: string[];
  readOnly: boolean;
  multiline: boolean;
  password: boolean;
  signed: boolean | null;
  editability: "field-value" | "read-only" | "signature-protected" | "unsupported";
  capability: NativeCapability;
}

export type NativePageObject = NativeTextObject | NativeImageObject | NativeVectorObject | NativeTableObject | NativeFormObject;

export interface NativePageTree {
  pageNumber: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  objects: NativePageObject[];
}

export interface NativeFontSummary {
  name: string;
  family: string;
  embedded: boolean;
  pages: number[];
  scripts: NativeScript[];
}

export interface NativeInspection {
  pageCount: number;
  canEdit: boolean;
  pages: NativePageTree[];
  fonts: NativeFontSummary[];
  totals: { text: number; images: number; vectors: number; tables: number; forms: number };
  warnings: string[];
}

export interface NativeTextEdit {
  id: string;
  kind: "text";
  objectId: string;
  pageNumber: number;
  originalText: string;
  text: string;
  bounds: NativeRect;
  fontFamily: "Helvetica" | "Times-Roman" | "Courier" | "ko" | "ja" | "zh-Hans" | "zh-Hant";
  fontSize: number;
  color: string;
  backgroundColor: string;
  align: "left" | "center" | "right";
  mode: "replace" | "overlay";
  wrap: boolean;
  fontSource: "built-in" | "built-in-cjk" | "imported-cjk" | "annotation-fallback";
  fontName?: string;
  fontBytes?: Uint8Array;
  fontLanguage?: "ko" | "ja" | "zh-Hans" | "zh-Hant";
  writingMode?: 0 | 1;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
}

export interface NativeImageEdit {
  id: string;
  kind: "image";
  objectId: string;
  pageNumber: number;
  bounds: NativeRect;
  /** Original detected image bounds. Kept separate so moving/resizing a replacement still removes the original source region. */
  sourceBounds?: NativeRect;
  bytes: Uint8Array;
  mimeType: string;
  removeUnderlying: boolean;
  fit: "contain" | "cover" | "stretch";
  opacity?: number;
}

export interface NativeVectorEdit {
  id: string;
  kind: "vector";
  objectId: string;
  pageNumber: number;
  bounds: NativeRect;
  commands: NativePathCommand[];
  action: "delete" | "restyle" | "transform";
  fillColor?: string;
  strokeColor?: string;
  lineWidth: number;
  alpha: number;
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
}

export interface NativeTableCellEdit {
  id: string;
  kind: "table-cell";
  objectId: string;
  cellId: string;
  pageNumber: number;
  bounds: NativeRect;
  originalText: string;
  text: string;
  fontSize: number;
  fontFamily?: NativeTextEdit["fontFamily"];
  fontSource?: NativeTextEdit["fontSource"];
  fontLanguage?: NativeTextEdit["fontLanguage"];
}

export interface NativeFormEdit {
  id: string;
  kind: "form";
  objectId: string;
  pageNumber: number;
  widgetIndex: number;
  name: string;
  fieldType: NativeFormFieldType;
  originalValue: string;
  value: string;
}

export type NativeEdit = NativeTextEdit | NativeImageEdit | NativeVectorEdit | NativeTableCellEdit | NativeFormEdit;

export interface NativeEditorState {
  projectId: string;
  schemaVersion: number;
  pageNumber: number;
  queuedEdits: NativeEdit[];
  updatedAt: number;
}

export interface NativeExportReport {
  operation: "native-content-edit";
  pageCount: number;
  outputBytes: number;
  changedPages: number[];
  textEdits: number;
  imageEdits: number;
  vectorEdits: number;
  tableCellEdits: number;
  formEdits: number;
  warnings: string[];
  durationMs: number;
}

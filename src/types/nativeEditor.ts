export const NATIVE_EDITOR_SCHEMA_VERSION = 4;

export interface NativeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NativeScript = "latin" | "cjk-ko" | "cjk-ja" | "cjk-zh-hans" | "cjk-zh-hant" | "complex" | "unknown";
export type NativeEditability = "fixed-box" | "cjk-fixed-box" | "overlay-only" | "unsupported";
export type NativeCapabilityLevel = "native-safe" | "safe-reconstruction" | "appearance-only" | "unsupported";
export type NativeTextDirection = "ltr" | "rtl" | "ttb" | "unknown";
export type NativeTextAlign = "left" | "center" | "right";
export type NativeFontFamily = "serif" | "sans-serif" | "monospace";
export type NativeFontWeight = "normal" | "bold";
export type NativeFontStyle = "normal" | "italic";
export type NativeEditableFontFamily = "Helvetica" | "Times-Roman" | "Courier" | "ko" | "ja" | "zh-Hans" | "zh-Hant";
export type NativeFontSource = "built-in" | "built-in-cjk" | "imported-cjk" | "imported-latin" | "annotation-fallback";
export type NativeTextLayoutMode = "fixed-box" | "expand-flow";
export type NativeImageAction = "transform" | "replace" | "delete";
export type NativeImageRotation = 0 | 90 | 180 | 270;
export type NativeVectorAction = "edit" | "delete";
export type NativeVectorPaint = "fill" | "stroke" | "fill-stroke";
export type NativeVectorLineCap = "Butt" | "Round" | "Square";
export type NativeVectorLineJoin = "Miter" | "Round" | "Bevel";
export type NativeVectorColorSpace = "Gray" | "RGB" | "BGR" | "CMYK" | "Lab" | "Indexed" | "Separation" | "Unknown";

export interface NativeCapability {
  level: NativeCapabilityLevel;
  label: string;
  confidence: number;
  reason: string;
  preserves: string[];
  risks: string[];
}

/** A font/style span retained from MuPDF preserve-spans extraction. */
export interface NativeTextRun {
  text: string;
  start: number;
  end: number;
  bounds: NativeRect;
  fontName: string;
  family: NativeFontFamily;
  size: number;
  weight: NativeFontWeight;
  style: NativeFontStyle;
  color?: string;
  writingMode: 0 | 1;
}

/**
 * Source-line evidence retained when span-level structured text is reconstructed
 * into one editable paragraph. P2 groups preserve-spans records into visual lines
 * so mixed formatting is not mistaken for extra paragraph lines.
 */
export interface NativeTextLine {
  objectId: string;
  text: string;
  bounds: NativeRect;
  fontName: string;
  family: NativeFontFamily;
  size: number;
  weight: NativeFontWeight;
  style: NativeFontStyle;
  color?: string;
  writingMode: 0 | 1;
}

export interface NativeTextFlowInfo {
  id: string;
  index: number;
  bounds: NativeRect;
  gapBefore?: number;
  gapAfter?: number;
}

export interface NativeTextObject {
  id: string;
  type: "text";
  pageNumber: number;
  bounds: NativeRect;
  text: string;
  fontName: string;
  family: NativeFontFamily;
  size: number;
  weight: NativeFontWeight;
  style: NativeFontStyle;
  color?: string;
  writingMode: 0 | 1;
  script: NativeScript;
  editability: NativeEditability;
  reason: string;
  capability: NativeCapability;
  /** True when structured text was reconstructed as one editable text flow. */
  paragraph?: boolean;
  /** Stable preserve-spans source ids covered by this paragraph. */
  sourceObjectIds?: string[];
  /** Preserve-spans evidence retained for diagnostics and fallback. */
  lines?: NativeTextLine[];
  /** P2 source formatting spans, with offsets into the reconstructed paragraph text. */
  runs?: NativeTextRun[];
  /** Number of MuPDF preserve-spans source records. */
  sourceSpanCount?: number;
  /** Number of actual visual text lines after coalescing same-baseline spans. */
  lineCount?: number;
  /** Median source baseline/box advance in PDF points. */
  lineHeight?: number;
  /** Alignment inferred from source line geometry. */
  align?: NativeTextAlign;
  /** Writing direction inferred conservatively from script/wmode. */
  direction?: NativeTextDirection;
  /** Conservative same-column flow membership used by P2 layout propagation. */
  flow?: NativeTextFlowInfo;
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
  paint: NativeVectorPaint;
  fillColor?: string;
  strokeColor?: string;
  fillColorSpace?: NativeVectorColorSpace;
  strokeColorSpace?: NativeVectorColorSpace;
  fillComponents?: number[];
  strokeComponents?: number[];
  lineWidth: number;
  lineCap: NativeVectorLineCap;
  lineJoin: NativeVectorLineJoin;
  miterLimit: number;
  dashPattern: number[];
  dashPhase: number;
  fillAlpha: number;
  strokeAlpha: number;
  evenOdd: boolean;
  blendMode: string;
  clipped: boolean;
  /** True when this path also establishes a clipping path for following PDF content. */
  definesClip: boolean;
  /** Direct page content stream/path indexes used for source-targeted P4 rewrites. */
  sourceStreamIndex: number;
  sourcePathIndex: number;
  sourceSignature: string;
  editability: "source-path" | "clip-protected";
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

/** A rendered replacement span. Unchanged prefix/suffix spans can retain source styling. */
export interface NativeTextEditRun {
  text: string;
  fontFamily: NativeEditableFontFamily;
  fontSize: number;
  color: string;
  fontWeight?: NativeFontWeight;
  fontStyle?: NativeFontStyle;
  fontName?: string;
}

export interface NativeTextEdit {
  id: string;
  kind: "text";
  objectId: string;
  pageNumber: number;
  originalText: string;
  text: string;
  bounds: NativeRect;
  /** Original source geometry. P2 can expand/move the destination without redacting the expanded area. */
  sourceBounds?: NativeRect;
  fontFamily: NativeEditableFontFamily;
  fontSize: number;
  color: string;
  backgroundColor: string;
  align: NativeTextAlign;
  mode: "replace" | "overlay";
  wrap: boolean;
  fontSource: NativeFontSource;
  fontName?: string;
  fontBytes?: Uint8Array;
  fontLanguage?: "ko" | "ja" | "zh-Hans" | "zh-Hant";
  writingMode?: 0 | 1;
  fontWeight?: NativeFontWeight;
  fontStyle?: NativeFontStyle;
  /** Source line advance retained when it remains safe for the replacement. */
  lineHeight?: number;
  /** P2 layout intent. Missing means the P1 fixed-box behavior. */
  layoutMode?: NativeTextLayoutMode;
  /** Styled replacement runs. Missing means one uniform run using the edit-level font controls. */
  styleRuns?: NativeTextEditRun[];
  /** True when styleRuns were derived from the source spans rather than user-authored arbitrary styling. */
  preserveSourceStyle?: boolean;
  /** Marks an automatically generated same-column follower move. */
  reflowFollower?: boolean;
}

export interface NativeImageEdit {
  id: string;
  kind: "image";
  objectId: string;
  pageNumber: number;
  /** P3 operation. Missing is migrated as replacement when bytes exist. */
  action?: NativeImageAction;
  bounds: NativeRect;
  /** Original detected image bounds. Source transforms always remove only this image region, never neighboring text/vector content. */
  sourceBounds?: NativeRect;
  /** Replacement bytes are optional because P3 source transforms and deletes reuse/remove the selected existing image. */
  bytes?: Uint8Array;
  mimeType?: string;
  removeUnderlying: boolean;
  fit: "contain" | "cover" | "stretch";
  rotation?: NativeImageRotation;
  opacity?: number;
}

export interface NativeVectorEdit {
  id: string;
  kind: "vector";
  objectId: string;
  pageNumber: number;
  action: NativeVectorAction;
  /** Destination geometry in MuPDF page coordinates. */
  bounds: NativeRect;
  /** Source geometry and direct source identity are retained so P4 edits the exact path operator range. */
  sourceBounds: NativeRect;
  sourceStreamIndex?: number;
  sourcePathIndex?: number;
  sourceSignature?: string;
  commands: NativePathCommand[];
  paint: NativeVectorPaint;
  rotation: number;
  /** False keeps the source PDF graphics state byte-for-byte outside the rewritten path range. */
  appearanceOverride: boolean;
  fillEnabled: boolean;
  strokeEnabled: boolean;
  fillColor?: string;
  strokeColor?: string;
  lineWidth: number;
  lineCap: NativeVectorLineCap;
  lineJoin: NativeVectorLineJoin;
  miterLimit: number;
  dashPattern: number[];
  dashPhase: number;
  alpha: number;
  evenOdd: boolean;
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
  fontFamily?: NativeEditableFontFamily;
  fontSource?: NativeFontSource;
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

export const CREATOR_PRESET_SCHEMA_VERSION = 1;

export type CreatorInputMode = "markdown" | "html" | "text";
export type CreatorPagePreset = "a4" | "a5" | "custom";
export type CreatorFontFamily = "sans" | "serif";
export type CreatorPdfMode = "searchable" | "visual";

export interface CreatorStyle {
  pagePreset: CreatorPagePreset;
  customWidthMm: number;
  customHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  fontFamily: CreatorFontFamily;
  bodySizePt: number;
  lineHeight: number;
  paragraphGapPt: number;
  headingScale: number;
  headerText: string;
  footerText: string;
  pageNumbers: boolean;
  firstPageNumber: number;
}

export interface CreatorDocumentMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export interface CreatorPreset {
  schemaVersion: number;
  id: string;
  name: string;
  style: CreatorStyle;
  updatedAt: number;
}

export type CreatorInlineStyle = "normal" | "bold" | "italic" | "bold-italic" | "code" | "link";
export interface CreatorInlineRun { text: string; style: CreatorInlineStyle; href?: string; }

export type CreatorBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string; runs?: CreatorInlineRun[] }
  | { type: "paragraph"; text: string; runs?: CreatorInlineRun[] }
  | { type: "bullet"; text: string; runs?: CreatorInlineRun[] }
  | { type: "numbered"; number: number; text: string; runs?: CreatorInlineRun[] }
  | { type: "quote"; text: string; runs?: CreatorInlineRun[] }
  | { type: "code"; text: string }
  | { type: "rule" };

export type CreatorFontRole = "body" | "bold" | "italic" | "bold-italic" | "mono";

export interface CreatorTextCommand {
  type: "text";
  xPt: number;
  yTopPt: number;
  text: string;
  fontSizePt: number;
  fontRole: CreatorFontRole;
  fontFamily: CreatorFontFamily;
  gray: number;
  underline?: boolean;
  linkUrl?: string;
  widthPt?: number;
}

export interface CreatorRuleCommand {
  type: "rule";
  xPt: number;
  yTopPt: number;
  widthPt: number;
  gray: number;
}

export type CreatorPageCommand = CreatorTextCommand | CreatorRuleCommand;

export interface CreatorLayoutPage {
  commands: CreatorPageCommand[];
}

export interface CreatorLayout {
  pageWidthPt: number;
  pageHeightPt: number;
  pages: CreatorLayoutPage[];
  warnings: string[];
}

export interface CreatorBuildRequest {
  layout: CreatorLayout;
  metadata: CreatorDocumentMetadata;
  style: CreatorStyle;
}

export interface CreatorBuildReport {
  pageCount: number;
  outputBytes: number;
  searchable: boolean;
  warnings: string[];
  durationMs: number;
}

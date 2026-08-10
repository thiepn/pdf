export const TOOLBOX_SCHEMA_VERSION = 1;

export interface ToolboxMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export interface ToolboxCrop {
  enabled: boolean;
  topPt: number;
  rightPt: number;
  bottomPt: number;
  leftPt: number;
}

export interface ToolboxBlankPages {
  enabled: boolean;
  position: "start" | "end";
  count: number;
  widthPt: number;
  heightPt: number;
}

export type ToolboxDecorationLanguage = "auto" | "ko" | "ja" | "zh-Hans" | "zh-Hant";

export interface ToolboxDecoration {
  enabled: boolean;
  watermarkText: string;
  headerText: string;
  footerText: string;
  pageNumbers: boolean;
  startNumber: number;
  fontSize: number;
  marginPt: number;
  fontLanguage?: ToolboxDecorationLanguage;
}

export interface ToolboxTransformOptions {
  metadata?: ToolboxMetadata;
  removeMetadata?: boolean;
  crop?: ToolboxCrop;
  blankPages?: ToolboxBlankPages;
  decoration?: ToolboxDecoration;
}

export interface ToolboxTransformReport {
  operation: string;
  pageCount: number;
  outputBytes: number;
  changedPages: number[];
  warnings: string[];
  durationMs: number;
}

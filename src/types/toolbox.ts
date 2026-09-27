export const TOOLBOX_SCHEMA_VERSION = 1;

export interface ToolboxMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export interface ToolboxCrop {
  /** 1-based page numbers. Omitted means all pages. */
  pageNumbers?: number[];
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
  /** One-based page numbers, omitted means all pages. Numbering starts on the first selected page. */
  pageNumbersToChange?: number[];
  numberPosition?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  watermarkSize?: number;
  watermarkGray?: number;
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

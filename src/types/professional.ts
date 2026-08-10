export interface ProfessionalRect { x: number; y: number; w: number; h: number }

export interface ProfessionalTextLine {
  id: string;
  pageNumber: number;
  text: string;
  bounds: ProfessionalRect;
  fontName: string;
  fontFamily: "serif" | "sans-serif" | "monospace";
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  classification: "redact-and-replace" | "overlay-only" | "unsupported";
  reason: string;
}

export interface ProfessionalImageRegion {
  id: string;
  pageNumber: number;
  bounds: ProfessionalRect;
}

export interface LayerInspection {
  index: number;
  name: string;
  visible: boolean;
}

export interface ArchivalFinding {
  id: string;
  severity: "pass" | "warning" | "fail" | "info";
  title: string;
  detail: string;
}

export interface ProfessionalInspection {
  pageCount: number;
  pdfVersion: string;
  language: string;
  tagged: boolean;
  titlePresent: boolean;
  encrypted: boolean;
  hasJavaScript: boolean;
  attachmentCount: number;
  layerCount: number;
  layers: LayerInspection[];
  textLines: ProfessionalTextLine[];
  imageRegions: ProfessionalImageRegion[];
  findings: ArchivalFinding[];
}

export interface TextReplacement {
  lineId: string;
  pageNumber: number;
  bounds: ProfessionalRect;
  originalText: string;
  replacementText: string;
  mode: "overlay" | "redact-replace";
  fontFamily: "Helvetica" | "Times-Roman" | "Courier";
  fontSize: number;
  color: string;
  backgroundColor: string;
}

export interface ImageReplacement {
  regionId: string;
  pageNumber: number;
  bounds: ProfessionalRect;
  bytes: Uint8Array;
  mimeType: string;
  removeUnderlying: boolean;
}

export interface BatesSettings {
  prefix: string;
  suffix: string;
  start: number;
  digits: number;
  pageRange: string;
  position: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  fontSize: number;
  color: string;
  includeFilename: boolean;
  filename: string;
  setPageLabels: boolean;
}

export interface ProfessionalExportReport {
  operation: string;
  pageCount: number;
  outputBytes: number;
  changedPages: number[];
  warnings: string[];
  durationMs: number;
}

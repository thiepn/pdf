export const OCR_SCHEMA_VERSION = 2;

export type OcrJobKind = "pdf" | "scan";
export type OcrJobStatus = "draft" | "running" | "paused" | "complete" | "failed" | "cancelled";
export type OcrPageStatus = "pending" | "rendering" | "recognizing" | "complete" | "failed" | "skipped";

export interface OcrPreprocessSettings {
  grayscale: boolean;
  contrast: number;
  brightness: number;
  threshold: number | null;
  invert: boolean;
  scale: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrPageResult {
  id: string;
  jobId: string;
  projectId?: string;
  pageNumber: number;
  status: OcrPageStatus;
  text: string;
  confidence: number;
  words: OcrWord[];
  hocr?: string;
  tsv?: string;
  searchablePdf?: ArrayBuffer;
  imageBytes?: ArrayBuffer;
  imageMimeType?: string;
  width: number;
  height: number;
  error?: string;
  updatedAt: number;
}

export interface OcrJob {
  schemaVersion: number;
  id: string;
  kind: OcrJobKind;
  projectId?: string;
  name: string;
  languages: string[];
  pageNumbers: number[];
  preprocess: OcrPreprocessSettings;
  recipeFingerprint?: string;
  status: OcrJobStatus;
  completedPages: number;
  totalPages: number;
  createdAt: number;
  updatedAt: number;
  outputProjectId?: string;
  error?: string;
}

export interface InstalledOcrLanguage {
  code: string;
  label: string;
  byteLength: number;
  source: "download" | "import";
  installedAt: number;
}

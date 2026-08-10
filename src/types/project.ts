export const PROJECT_SCHEMA_VERSION = 3;

export interface PdfDocumentSummary {
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  pdfFormatVersion?: string;
  encrypted: boolean;
  hasOutline: boolean;
  annotationCount?: number;
  formFieldCount?: number;
  attachmentCount?: number;
  hasJavaScript?: boolean;
  pageLabels?: string[];
}

export interface ProjectManifest {
  schemaVersion: number;
  id: string;
  name: string;
  sourceFilename: string;
  mimeType: string;
  byteLength: number;
  checksum: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  storageKind: "opfs" | "indexeddb";
  sourcePath?: string;
  summary: PdfDocumentSummary;
  recovery: {
    dirty: boolean;
    lastValidSnapshotAt?: number;
    interruptedJob?: string;
  };
  lineage?: {
    rootProjectId: string;
    parentProjectId?: string;
    origin: "import" | "package" | "checkpoint" | "derived";
    sourceRevisionId?: string;
  };
  revision?: {
    id: string;
    sequence: number;
    createdAt: number;
    operation: string;
    parentRevisionId?: string;
  };
}

export interface ViewerPreferences {
  projectId: string;
  pageNumber: number;
  zoom: number;
  viewMode: "single" | "continuous";
  sidebarTab: "pages" | "outline" | "search" | "info";
  sidebarOpen: boolean;
  updatedAt: number;
}

export interface ProjectPackageAssetHeader {
  id: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  byteLength: number;
  offset: number;
  createdAt: number;
}


export interface ProjectPackageOcrPageHeader extends Omit<import("./ocr").OcrPageResult, "searchablePdf" | "imageBytes"> {
  searchablePdfOffset?: number;
  searchablePdfByteLength?: number;
  imageOffset?: number;
  imageByteLength?: number;
}

export interface ProjectPackageHeader {
  format: "local-pdf-studio-project";
  formatVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  exportedAt: number;
  integrity?: {
    algorithm: "SHA-256";
    payloadChecksum: string;
    payloadByteLength: number;
    metadataChecksum?: string;
  };
  manifest: ProjectManifest;
  pdfByteLength?: number;
  viewerPreferences?: ViewerPreferences;
  editorState?: import("./editor").EditorDocumentState;
  editorAssets?: ProjectPackageAssetHeader[];
  securityState?: import("./security").SecurityProjectState;
  ocrJobs?: import("./ocr").OcrJob[];
  ocrPages?: ProjectPackageOcrPageHeader[];
  nativeState?: import("./nativeEditor").NativeEditorState;
  complianceState?: import("./compliance").ComplianceState;
}

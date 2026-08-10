export type ComplianceFieldType = "text" | "multiline" | "password" | "checkbox" | "radio" | "combo" | "list" | "button" | "signature";
export type PdfAProfile = "none" | "PDF/A-1b" | "PDF/A-2b" | "PDF/A-3b";
export type PreflightProfile = "archival" | "accessibility" | "print" | "security" | "signatures";
export type PreflightSeverity = "pass" | "info" | "warning" | "error";
export type StructureQuality = "missing" | "baseline" | "partial" | "meaningful";
export type ReadingOrderStatus = "missing" | "baseline" | "partial" | "present";

export interface ComplianceRect { x: number; y: number; w: number; h: number }
export interface ComplianceFieldDraft {
  id: string;
  pageNumber: number;
  type: ComplianceFieldType;
  name: string;
  tooltip: string;
  bounds: ComplianceRect;
  defaultValue: string;
  required: boolean;
  readOnly: boolean;
  options: string[];
  fontSize: number;
}
export interface ComplianceFieldInfo {
  pageNumber: number;
  name: string;
  tooltip: string;
  type: string;
  value: string;
  required: boolean;
  readOnly: boolean;
  signed: boolean;
  bounds: ComplianceRect;
}
export interface SignatureByteRangeInfo {
  byteRange: [number, number, number, number] | null;
  status: "unsigned" | "invalid-range" | "covers-current-file" | "covers-prior-revision" | "structural-only";
  coveredBytes: number;
  unsignedTailBytes: number;
  signatureGapBytes: number;
  filter: string;
  subFilter: string;
  signingTime: string;
  reason: string;
  location: string;
}
export interface ComplianceSignatureInfo extends SignatureByteRangeInfo {
  pageNumber: number;
  name: string;
  signed: boolean;
  reasonSummary: string;
}
export interface PreflightFinding {
  id: string;
  profile: PreflightProfile;
  severity: PreflightSeverity;
  title: string;
  detail: string;
  repairable: boolean;
}
export interface StructureElementInfo {
  id: string;
  path: number[];
  tag: string;
  title: string;
  altText: string;
  language: string;
  pageNumber: number | null;
  childCount: number;
  depth: number;
  topLevelIndex: number;
}
export interface AccessibilitySummary {
  tagged: boolean;
  language: string;
  title: string;
  structureRoot: boolean;
  structureQuality: StructureQuality;
  structureElementCount: number;
  topLevelElementCount: number;
  figuresWithoutAltText: number;
  formFieldsWithoutTooltips: number;
  readingOrderStatus: ReadingOrderStatus;
  headingCount: number;
  tableCount: number;
}
export interface PageBoxInfo {
  pageNumber: number;
  mediaBox: ComplianceRect;
  cropBox: ComplianceRect;
  trimBox: ComplianceRect | null;
  bleedBox: ComplianceRect | null;
  artBox: ComplianceRect | null;
  rotation: number;
  transparency: boolean;
  overprint: boolean;
  annotationCount: number;
}
export interface OutputIntentInfo {
  subtype: string;
  outputConditionIdentifier: string;
  info: string;
  registryName: string;
  components: number | null;
  embeddedProfile: boolean;
}
export interface PdfAClaim {
  claimed: boolean;
  part: string;
  conformance: string;
  profile: string;
}
export interface ComplianceInspection {
  pageCount: number;
  pdfVersion: string;
  encrypted: boolean;
  fields: ComplianceFieldInfo[];
  signatures: ComplianceSignatureInfo[];
  accessibility: AccessibilitySummary;
  structureElements: StructureElementInfo[];
  findings: PreflightFinding[];
  pages: PageBoxInfo[];
  outputIntents: OutputIntentInfo[];
  pdfaClaim: PdfAClaim;
  fontTotal: number;
  fontEmbedded: number;
  hasJavaScript: boolean;
  hasUnsafeActions: boolean;
  hasXfa: boolean;
  attachmentCount: number;
  layerCount: number;
  metadata: Record<string, string>;
  versionCount: number;
  changeHistoryStatus: string;
  warnings: string[];
}
export interface AccessibilityRepair {
  elementId: string;
  altText?: string;
  language?: string;
}
export interface ComplianceOptions {
  fields: ComplianceFieldDraft[];
  prepareArchival: boolean;
  archivalLevel: PdfAProfile;
  removeActiveContent: boolean;
  setLanguage: string;
  setTitle: string;
  createBaselineTags: boolean;
  flattenForms: boolean;
  addOutputIntent: boolean;
  normalizeXmp: boolean;
  repairMissingFormTooltips: boolean;
  accessibilityRepairs: AccessibilityRepair[];
  topLevelReadingOrder: string[];
}
export interface ComplianceExportReport {
  operation: "compliance-export";
  pageCount: number;
  outputBytes: number;
  fieldsCreated: number;
  signatureFieldsCreated: number;
  activeContentRemoved: boolean;
  baselineTagged: boolean;
  archivalPrepared: boolean;
  archivalProfile: PdfAProfile;
  outputIntentEmbedded: boolean;
  xmpNormalized: boolean;
  encryptionRemoved: boolean;
  accessibilityRepairsApplied: number;
  formTooltipsRepaired: number;
  findings: PreflightFinding[];
  warnings: string[];
  durationMs: number;
}
export interface DetachedSignatureEvidence {
  schemaVersion: 1;
  algorithm: "ECDSA-P256-SHA256";
  createdAt: number;
  filename: string;
  documentSha256: string;
  publicKeyJwk: JsonWebKey;
  signatureBase64: string;
  verified: boolean;
}
export interface ComplianceState {
  projectId: string;
  schemaVersion: 2;
  draftFields: ComplianceFieldDraft[];
  options: ComplianceOptions;
  updatedAt: number;
}

import type { Rect } from "../core/coordinates";

export const SECURITY_SCHEMA_VERSION = 1;

export type FormFieldType = "button" | "checkbox" | "combobox" | "listbox" | "radiobutton" | "signature" | "text" | "unknown";

export interface SecurityFormField {
  id: string;
  pageNumber: number;
  widgetIndex: number;
  type: FormFieldType;
  name: string;
  label: string;
  value: string;
  options: string[];
  rect: Rect;
  readOnly: boolean;
  multiline: boolean;
  password: boolean;
  comb: boolean;
  signed: boolean | null;
}

export interface FormFieldUpdate {
  id: string;
  pageNumber: number;
  widgetIndex: number;
  name: string;
  type: FormFieldType;
  value: string;
}

export interface PermissionState {
  print: boolean;
  edit: boolean;
  copy: boolean;
  annotate: boolean;
  form: boolean;
  accessibility: boolean;
  assemble: boolean;
  printHighQuality: boolean;
}

export interface SignatureInspection {
  id: string;
  pageNumber: number;
  name: string;
  signed: boolean | null;
  signatory?: string;
  digestStatus?: string;
  certificateStatus?: string;
  changesSinceSigning?: boolean | null;
  validationSupported: boolean;
}

export interface SecurityInspectionReport {
  pageCount: number;
  encrypted: boolean;
  authentication: "none" | "user" | "owner" | "user-and-owner";
  encryptionDescription: string;
  permissions: PermissionState;
  versionCount: number;
  changeHistoryStatus: number | null;
  repaired: boolean;
  formFields: SecurityFormField[];
  signatures: SignatureInspection[];
  annotationCount: number;
  redactionMarkCount: number;
  linkCount: number;
  attachmentCount: number;
  hasJavaScript: boolean;
  hasOpenAction: boolean;
  hasAdditionalActions: boolean;
  metadata: Record<string, string>;
  warnings: string[];
}

export type RedactionImageMode = "none" | "remove" | "pixels" | "unless-invisible";
export type RedactionLineArtMode = "none" | "covered" | "touched";

export interface RedactionApplyOptions {
  enabled: boolean;
  blackBoxes: boolean;
  imageMode: RedactionImageMode;
  lineArtMode: RedactionLineArtMode;
  removeText: boolean;
}

export interface SanitizationOptions {
  removeMetadata: boolean;
  removeJavaScript: boolean;
  removeOpenActions: boolean;
  removeAttachments: boolean;
  removeLinks: boolean;
  removeComments: boolean;
  clearFormValues: boolean;
  flattenForms: boolean;
  flattenAnnotations: boolean;
  collapseRevisionHistory: boolean;
}

export interface EncryptionPermissions {
  print: boolean;
  edit: boolean;
  copy: boolean;
  annotate: boolean;
  form: boolean;
  accessibility: boolean;
  assemble: boolean;
  printHighQuality: boolean;
}

export interface EncryptionOptions {
  mode: "keep" | "remove" | "aes-256";
  userPassword: string;
  ownerPassword: string;
  permissions: EncryptionPermissions;
}

export interface SecurityProjectState {
  schemaVersion: number;
  projectId: string;
  formValues: Record<string, string>;
  redaction: RedactionApplyOptions;
  sanitization: SanitizationOptions;
  encryption: EncryptionOptions;
  currentPage: number;
  zoom: number;
  updatedAt: number;
}

export interface SecurityExportOptions {
  formUpdates: FormFieldUpdate[];
  redaction: RedactionApplyOptions;
  sanitization: SanitizationOptions;
  encryption: EncryptionOptions;
}

export interface SecurityExportReport {
  pageCount: number;
  formFieldsUpdated: number;
  redactionsApplied: number;
  signaturesDetected: number;
  metadataRemoved: boolean;
  javascriptRemoved: boolean;
  attachmentsRemoved: number;
  linksRemoved: number;
  commentsRemoved: number;
  formValuesCleared: number;
  formsFlattened: boolean;
  annotationsFlattened: boolean;
  encrypted: boolean;
  outputBytes: number;
  durationMs: number;
  warnings: string[];
}

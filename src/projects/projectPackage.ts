import { sha256 } from "../core/checksum";
import { isSupportedProjectPackageVersion, PROJECT_PACKAGE_VERSION } from "../core/release";
import { EDITOR_SCHEMA_VERSION, type EditorAssetRecord, type EditorDocumentState } from "../types/editor";
import { OCR_SCHEMA_VERSION, type OcrJob, type OcrPageResult } from "../types/ocr";
import { PROJECT_SCHEMA_VERSION, type ProjectManifest, type ProjectPackageAssetHeader, type ProjectPackageHeader, type ProjectPackageOcrPageHeader, type ViewerPreferences } from "../types/project";
import { SECURITY_SCHEMA_VERSION, type SecurityProjectState } from "../types/security";
import { NATIVE_EDITOR_SCHEMA_VERSION, type NativeEditorState } from "../types/nativeEditor";
import type { ComplianceState } from "../types/compliance";
import { assertNonOverlappingPayloadRanges, requireArray, requireNonEmptyString, requirePayloadRange, requirePositiveSafeInteger, validatePayloadRange, type PayloadRange } from "./packageValidation";
import { assertReadableStateSchema } from "./stateSchemaGuard";
import { assertReadableProjectManifestSchema } from "./projectManifestMigration";

const MAGIC = "LPSP1\0";
const PREFIX_BYTES = 6;
const LENGTH_BYTES = 4;

export interface DecodedProjectPackage {
  header: ProjectPackageHeader;
  pdfBytes: Uint8Array;
  assets: EditorAssetRecord[];
  ocrJobs: OcrJob[];
  ocrPages: OcrPageResult[];
  rawPayload: Uint8Array;
}

function asBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}


function assertUniquePackageIds(values: unknown[], getId: (value: unknown) => unknown, label: string): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    const id = requireNonEmptyString(getId(value), `${label} ID`);
    if (ids.has(id)) throw new Error(`${label} ID “${id}” is duplicated.`);
    ids.add(id);
  }
  return ids;
}

function validatePackageSemanticReferences(
  header: ProjectPackageHeader,
  assetHeaders: ProjectPackageAssetHeader[],
  ocrJobs: OcrJob[],
  ocrPageHeaders: ProjectPackageOcrPageHeader[]
): void {
  const assetIds = assertUniquePackageIds(assetHeaders, (value) => (value as ProjectPackageAssetHeader).id, "Project asset");
  const editorObjects = (header.editorState as unknown as { objects?: unknown } | undefined)?.objects;
  if (editorObjects !== undefined && !Array.isArray(editorObjects)) throw new Error("Project editor objects must be an array.");
  const editorObjectIds = new Set<string>();
  for (const object of editorObjects ?? []) {
    if (!object || typeof object !== "object") throw new Error("Project editor object is invalid.");
    const record = object as { id?: unknown; type?: unknown; assetId?: unknown };
    const objectId = requireNonEmptyString(record.id, "Project editor object ID");
    if (editorObjectIds.has(objectId)) throw new Error(`Project editor object ID “${objectId}” is duplicated.`);
    editorObjectIds.add(objectId);
    if (record.type === "image") {
      const assetId = requireNonEmptyString(record.assetId, "Project image asset reference");
      if (!assetIds.has(assetId)) throw new Error(`Project image references missing asset “${assetId}”.`);
    }
  }

  const jobIds = assertUniquePackageIds(ocrJobs as unknown[], (value) => (value as OcrJob).id, "OCR job");
  const pageKeys = new Set<string>();
  for (const page of ocrPageHeaders) {
    const jobId = requireNonEmptyString(page.jobId, "OCR page job reference");
    if (!jobIds.has(jobId)) throw new Error(`OCR page ${String(page.pageNumber)} references missing job “${jobId}”.`);
    const pageNumber = requirePositiveSafeInteger(page.pageNumber, `OCR page for job “${jobId}” page number`);
    const key = `${jobId}:${pageNumber}`;
    if (pageKeys.has(key)) throw new Error(`OCR page “${key}” is duplicated.`);
    pageKeys.add(key);
  }
}

function validateEmbeddedStateSchemas(header: ProjectPackageHeader, ocrJobs: OcrJob[]): void {
  if (header.editorState) assertReadableStateSchema(header.editorState.schemaVersion, EDITOR_SCHEMA_VERSION, "Project package editor state");
  if (header.securityState) assertReadableStateSchema(header.securityState.schemaVersion, SECURITY_SCHEMA_VERSION, "Project package security state");
  if (header.nativeState) assertReadableStateSchema(header.nativeState.schemaVersion, NATIVE_EDITOR_SCHEMA_VERSION, "Project package native editor state");
  if (header.complianceState) assertReadableStateSchema(header.complianceState.schemaVersion, 2, "Project package compliance state");
  for (const job of ocrJobs) assertReadableStateSchema(job.schemaVersion, OCR_SCHEMA_VERSION, `OCR job “${String(job.id ?? "unknown") }”`);
}

function metadataIntegrityBytes(header: ProjectPackageHeader): Uint8Array {
  const integrity = header.integrity ? { ...header.integrity } : undefined;
  if (integrity) delete integrity.metadataChecksum;
  const normalized = { ...header, integrity };
  return new TextEncoder().encode(stableJson(normalized));
}

export async function encodeProjectPackage(
  manifest: ProjectManifest,
  pdfBytes: Uint8Array,
  viewerPreferences?: ViewerPreferences,
  editorState?: EditorDocumentState,
  assets: EditorAssetRecord[] = [],
  securityState?: SecurityProjectState,
  ocrJobs: OcrJob[] = [],
  ocrPages: OcrPageResult[] = [],
  nativeState?: NativeEditorState,
  complianceState?: ComplianceState
): Promise<Blob> {
  let offset = pdfBytes.byteLength;
  const payloadChunks: Uint8Array[] = [pdfBytes];
  const assetHeaders: ProjectPackageAssetHeader[] = assets.map((asset) => {
    const bytes = asBytes(asset.bytes);
    const header: ProjectPackageAssetHeader = { id: asset.id, name: asset.name, mimeType: asset.mimeType, width: asset.width, height: asset.height, byteLength: bytes.byteLength, offset, createdAt: asset.createdAt };
    offset += bytes.byteLength;
    payloadChunks.push(bytes);
    return header;
  });
  const pageHeaders: ProjectPackageOcrPageHeader[] = ocrPages.map((page) => {
    const { searchablePdf, imageBytes, ...plain } = page;
    const header: ProjectPackageOcrPageHeader = { ...plain };
    if (searchablePdf) {
      const bytes = asBytes(searchablePdf);
      header.searchablePdfOffset = offset; header.searchablePdfByteLength = bytes.byteLength; offset += bytes.byteLength; payloadChunks.push(bytes);
    }
    if (imageBytes) {
      const bytes = asBytes(imageBytes);
      header.imageOffset = offset; header.imageByteLength = bytes.byteLength; offset += bytes.byteLength; payloadChunks.push(bytes);
    }
    return header;
  });
  const payload = concatenate(payloadChunks);
  const header: ProjectPackageHeader = {
    format: "local-pdf-studio-project",
    formatVersion: PROJECT_PACKAGE_VERSION,
    exportedAt: Date.now(),
    integrity: { algorithm: "SHA-256", payloadChecksum: await sha256(payload), payloadByteLength: payload.byteLength },
    manifest,
    pdfByteLength: pdfBytes.byteLength,
    viewerPreferences,
    editorState,
    editorAssets: assetHeaders,
    securityState: securityState ? { ...securityState, projectId: manifest.id, encryption: { ...securityState.encryption, userPassword: "", ownerPassword: "" } } : undefined,
    ocrJobs,
    ocrPages: pageHeaders,
    nativeState,
    complianceState
  };
  if (PROJECT_PACKAGE_VERSION >= 9 && header.integrity) header.integrity.metadataChecksum = await sha256(metadataIntegrityBytes(header));
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const prefix = new TextEncoder().encode(MAGIC);
  const length = new Uint8Array(LENGTH_BYTES);
  new DataView(length.buffer).setUint32(0, headerBytes.byteLength, true);
  return new Blob([prefix, length, headerBytes, payload], { type: "application/x-local-pdf-studio-project" });
}

export function decodeProjectPackage(bytes: Uint8Array): DecodedProjectPackage {
  if (bytes.byteLength < PREFIX_BYTES + LENGTH_BYTES) throw new Error("Project package is truncated.");
  const prefix = new TextDecoder().decode(bytes.slice(0, PREFIX_BYTES));
  if (prefix !== MAGIC) throw new Error("This is not a PDF Studio project package.");
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset + PREFIX_BYTES, LENGTH_BYTES).getUint32(0, true);
  const headerStart = PREFIX_BYTES + LENGTH_BYTES;
  const headerEnd = headerStart + headerLength;
  if (headerLength <= 0 || headerEnd > bytes.byteLength) throw new Error("Project package header is invalid or truncated.");
  let header: ProjectPackageHeader;
  try { header = JSON.parse(new TextDecoder().decode(bytes.slice(headerStart, headerEnd))) as ProjectPackageHeader; }
  catch { throw new Error("Project package metadata is invalid."); }
  if (header.format !== "local-pdf-studio-project" || !isSupportedProjectPackageVersion(header.formatVersion)) throw new Error("Unsupported project package version.");
  if (!header.manifest || typeof header.manifest !== "object") throw new Error("Project package is missing its source manifest.");
  requireNonEmptyString(header.manifest.id, "Project manifest ID");
  requireNonEmptyString(header.manifest.name, "Project manifest name");
  requireNonEmptyString(header.manifest.sourceFilename, "Project manifest source filename");
  requireNonEmptyString(header.manifest.mimeType, "Project manifest MIME type");
  assertReadableProjectManifestSchema(header.manifest.schemaVersion, PROJECT_SCHEMA_VERSION);
  const payload = bytes.slice(headerEnd);
  if (header.formatVersion === 1) return { header, pdfBytes: payload, assets: [], ocrJobs: [], ocrPages: [], rawPayload: payload };
  const pdfByteLength = requirePositiveSafeInteger(header.pdfByteLength, "Project package PDF byte length");
  if (pdfByteLength > payload.byteLength) throw new Error("Project package PDF payload is invalid or truncated.");
  const pdfBytes = payload.slice(0, pdfByteLength);
  const ranges: PayloadRange[] = [];
  const readRange = (offset: number | undefined, length: number | undefined, label: string): ArrayBuffer | undefined => {
    const range = validatePayloadRange(offset, length, pdfByteLength, payload.byteLength, label);
    if (!range) return undefined;
    ranges.push(range);
    const view = payload.slice(range.start, range.end);
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  };
  const assetHeaders = header.editorAssets === undefined ? [] : requireArray<ProjectPackageAssetHeader>(header.editorAssets, "Project editor assets");
  const ocrPageHeaders = header.ocrPages === undefined ? [] : requireArray<ProjectPackageOcrPageHeader>(header.ocrPages, "Project OCR pages");
  const ocrJobs = header.ocrJobs === undefined ? [] : requireArray<OcrJob>(header.ocrJobs, "Project OCR jobs");
  validateEmbeddedStateSchemas(header, ocrJobs);
  validatePackageSemanticReferences(header, assetHeaders, ocrJobs, ocrPageHeaders);
  const assets = assetHeaders.map((asset): EditorAssetRecord => {
    requireNonEmptyString(asset.id, "Project asset ID");
    requireNonEmptyString(asset.name, "Project asset name");
    requireNonEmptyString(asset.mimeType, `Project asset “${asset.name}” MIME type`);
    const range = requirePayloadRange(asset.offset, asset.byteLength, pdfByteLength, payload.byteLength, `Project asset “${asset.name}”`);
    ranges.push(range);
    const view = payload.slice(range.start, range.end);
    return {
      id: asset.id,
      projectId: header.manifest.id,
      name: asset.name,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      byteLength: range.end - range.start,
      bytes: view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
      createdAt: asset.createdAt
    };
  });
  const ocrPages = ocrPageHeaders.map((page): OcrPageResult => {
    const { searchablePdfOffset, searchablePdfByteLength, imageOffset, imageByteLength, ...plain } = page;
    return {
      ...plain,
      searchablePdf: readRange(searchablePdfOffset, searchablePdfByteLength, `OCR page ${page.pageNumber} PDF`),
      imageBytes: readRange(imageOffset, imageByteLength, `OCR page ${page.pageNumber} image`)
    };
  });
  assertNonOverlappingPayloadRanges(ranges);
  return { header, pdfBytes, assets, ocrJobs, ocrPages, rawPayload: payload };
}

export async function verifyProjectPackageIntegrity(projectPackage: DecodedProjectPackage): Promise<void> {
  const integrity = projectPackage.header.integrity;
  if (!integrity) return;
  if (integrity.algorithm !== "SHA-256") throw new Error(`Unsupported project package integrity algorithm: ${integrity.algorithm}.`);
  if (integrity.payloadByteLength !== projectPackage.rawPayload.byteLength) throw new Error("Project package payload length does not match its integrity manifest.");
  const actual = await sha256(projectPackage.rawPayload);
  if (actual !== integrity.payloadChecksum) throw new Error("Project package payload integrity verification failed. The backup is damaged or incomplete.");
  if (projectPackage.header.formatVersion >= 9) {
    if (!integrity.metadataChecksum) throw new Error("Project package metadata integrity checksum is missing.");
    const metadataChecksum = await sha256(metadataIntegrityBytes(projectPackage.header));
    if (metadataChecksum !== integrity.metadataChecksum) throw new Error("Project package metadata integrity verification failed. The backup header is damaged or incomplete.");
  }
}

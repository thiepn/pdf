export interface PdfContainerFeatures {
  encrypted: boolean;
  incrementalUpdates: number;
  objectStreams: boolean;
  xrefStreams: boolean;
  linearized: boolean;
  previousXref: boolean;
}

export interface PdfPageGeometryFingerprint {
  pageNumber: number;
  view: [number, number, number, number];
  rotation: number;
  userUnit: number;
}

export interface PdfPageSemanticFingerprint {
  pageNumber: number;
  textCharacters: number;
  textDigest: string;
  imageOperations: number;
  vectorOperations: number;
  annotationCount: number;
  linkCount: number;
  widgetCount: number;
}

/** Volatile inspection-only field evidence: values are never persisted or put into error messages. */
export interface PdfFormWidgetFingerprint {
  name: string;
  type: string;
  pageNumber: number;
  rect: number[];
  value: string;
  defaultValue: string;
  exportValues: string;
  editable: boolean;
  password: boolean;
}

export interface PdfFidelityProfile {
  pageCount: number;
  sampledPages: number[];
  affectedPages: number[];
  container: PdfContainerFeatures;
  outlineEntries: number;
  attachmentCount: number;
  formFieldCount: number;
  formWidgets?: PdfFormWidgetFingerprint[];
  hasJavaScript: boolean;
  pageLabelsDigest: string;
  coreMetadata: Record<string, string>;
  geometry: PdfPageGeometryFingerprint[];
  semantics: PdfPageSemanticFingerprint[];
}

export interface PdfFidelityExpectations {
  expectedEncrypted?: boolean;
  expectedAttachmentCount?: number;
  expectedFormFieldCount?: number;
  expectedHasJavaScript?: boolean;
  allowJavaScriptRemoval?: boolean;
  coreMetadataMode?: "preserve" | "cleared";
  widgetDeltaByPage?: Record<number, number>;
  expectNoWidgetsOnAffectedPages?: boolean;
  /** Only the explicitly requested final values are allowed to differ. */
  formValueUpdates?: Array<{ name: string; value: string }>;
  formCreates?: Array<{ name: string; pageNumber: number; type: "text" | "checkbox"; value: string }>;
  clearFormValues?: boolean;
  flattenForms?: boolean;
}

export interface PdfFidelityReport {
  passed: boolean;
  failures: string[];
  warnings: string[];
  sampledPages: number[];
  sampledAffectedPages: number[];
  affectedPageCount: number;
}

const GEOMETRY_TOLERANCE = 0.02;
const DEFAULT_MAX_SAMPLED_PAGES = 32;

function asciiAt(bytes: Uint8Array, index: number, token: string): boolean {
  if (index + token.length > bytes.length) return false;
  for (let offset = 0; offset < token.length; offset += 1) {
    if (bytes[index + offset] !== token.charCodeAt(offset)) return false;
  }
  return true;
}

function countAscii(bytes: Uint8Array, token: string): number {
  if (!token || bytes.length < token.length) return 0;
  let count = 0;
  for (let index = 0; index <= bytes.length - token.length; index += 1) {
    if (!asciiAt(bytes, index, token)) continue;
    count += 1;
    index += token.length - 1;
  }
  return count;
}

function containsAscii(bytes: Uint8Array, token: string): boolean {
  if (!token || bytes.length < token.length) return false;
  for (let index = 0; index <= bytes.length - token.length; index += 1) if (asciiAt(bytes, index, token)) return true;
  return false;
}

export function analyzePdfContainerFeatures(bytes: Uint8Array): PdfContainerFeatures {
  return {
    encrypted: containsAscii(bytes, "/Encrypt"),
    incrementalUpdates: countAscii(bytes, "startxref"),
    objectStreams: containsAscii(bytes, "/ObjStm"),
    xrefStreams: containsAscii(bytes, "/XRef") || containsAscii(bytes, "/Type /XRef"),
    linearized: containsAscii(bytes, "/Linearized"),
    previousXref: containsAscii(bytes, "/Prev")
  };
}

export function stableTextDigest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizedPages(pageCount: number, pages: Iterable<number>): number[] {
  return [...new Set(pages)]
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount)
    .sort((a, b) => a - b);
}

function evenlyPick(values: number[], count: number): number[] {
  if (count <= 0 || !values.length) return [];
  if (values.length <= count) return values;
  if (count === 1) return [values[Math.floor((values.length - 1) / 2)]];
  const result = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const position = Math.round(index * (values.length - 1) / (count - 1));
    result.add(values[position]);
  }
  return [...result].sort((a, b) => a - b);
}

/**
 * P8 intentionally bounds semantic inspection. Every normal edit page is
 * covered; very large batch edits are sampled deterministically with document
 * anchors and evenly spaced pages so compatibility checking cannot become an
 * unbounded second render pass on thousand-page documents.
 */
export function chooseFidelitySamplePages(
  pageCount: number,
  affectedPages: Iterable<number>,
  maxPages = DEFAULT_MAX_SAMPLED_PAGES
): number[] {
  if (pageCount <= 0 || maxPages <= 0) return [];
  const affected = normalizedPages(pageCount, affectedPages);
  const selected = new Set<number>();
  selected.add(1);
  selected.add(pageCount);

  const capacityAfterAnchors = Math.max(0, maxPages - selected.size);
  const affectedSelection = evenlyPick(affected, capacityAfterAnchors);
  affectedSelection.forEach((page) => selected.add(page));

  for (const page of affectedSelection) {
    if (selected.size >= maxPages) break;
    if (page > 1) selected.add(page - 1);
    if (selected.size >= maxPages) break;
    if (page < pageCount) selected.add(page + 1);
  }

  if (selected.size < maxPages) {
    const remaining = Array.from({ length: pageCount }, (_, index) => index + 1).filter((page) => !selected.has(page));
    evenlyPick(remaining, maxPages - selected.size).forEach((page) => selected.add(page));
  }

  return [...selected].sort((a, b) => a - b);
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= GEOMETRY_TOLERANCE;
}

function sameView(left: PdfPageGeometryFingerprint, right: PdfPageGeometryFingerprint): boolean {
  return left.view.every((value, index) => closeEnough(value, right.view[index]))
    && left.rotation === right.rotation
    && closeEnough(left.userUnit, right.userUnit);
}

function geometryMap(profile: PdfFidelityProfile): Map<number, PdfPageGeometryFingerprint> {
  return new Map(profile.geometry.map((item) => [item.pageNumber, item]));
}

function semanticMap(profile: PdfFidelityProfile): Map<number, PdfPageSemanticFingerprint> {
  return new Map(profile.semantics.map((item) => [item.pageNumber, item]));
}

function compareCoreMetadata(
  source: Record<string, string>,
  output: Record<string, string>,
  failures: string[],
  mode: PdfFidelityExpectations["coreMetadataMode"] = "preserve"
): void {
  for (const key of ["Title", "Author", "Subject", "Keywords", "Creator"]) {
    if (mode === "cleared") {
      if ((output[key] ?? "") !== "") failures.push(`Document metadata ${key} was expected to be cleared.`);
    } else if ((source[key] ?? "") !== (output[key] ?? "")) {
      failures.push(`Document metadata ${key} changed unexpectedly.`);
    }
  }
}


function formWidgetIdentity(widget: PdfFormWidgetFingerprint): string {
  return JSON.stringify([widget.name, widget.type, widget.pageNumber, widget.rect.map((n) => Math.round(n * 100) / 100), widget.exportValues]);
}

function clearedFormValue(widget: PdfFormWidgetFingerprint): boolean {
  if (widget.type === "checkbox" || widget.type === "radiobutton") {
    return widget.value === JSON.stringify("Off") || widget.value === JSON.stringify("");
  }
  return [JSON.stringify(""), JSON.stringify(null), JSON.stringify([])].includes(widget.value);
}

function compareFormWidgets(
  source: PdfFidelityProfile,
  output: PdfFidelityProfile,
  expectations: PdfFidelityExpectations,
  failures: string[]
): void {
  // Hand-built unit profiles predating this evidence may omit the snapshots.
  // Real PDF.js inspections always populate them (even for form-free PDFs).
  if (!source.formWidgets || !output.formWidgets) return;
  const before = source.formWidgets;
  const after = output.formWidgets;
  if (expectations.flattenForms) {
    if (before.some((field) => field.type === "signature")) failures.push("Flattening would remove a signature field.");
    if (after.length) failures.push("Flattened output still contains interactive form widgets.");
    return;
  }
  const updates = new Map<string, string>();
  for (const update of expectations.formValueUpdates ?? []) {
    if (!update.name || (updates.has(update.name) && updates.get(update.name) !== JSON.stringify(update.value))) {
      failures.push("Conflicting or invalid authorized form update.");
      continue;
    }
    const eligible = before.filter((field) => field.name === update.name);
    if (!eligible.length || eligible.some((field) => !field.editable || field.password || field.type === "signature")) {
      failures.push("A form update targets a protected or missing field.");
      continue;
    }
    updates.set(update.name, JSON.stringify(update.value));
  }
  const additions = [...(expectations.formCreates ?? [])];
  for (const addition of additions) {
    if (!addition.name || before.some((field) => field.name === addition.name)) {
      failures.push("A created form field has a missing or already-used name.");
    }
  }

  const afterByIdentity = new Map<string, PdfFormWidgetFingerprint[]>();
  for (const widget of after) {
    const key = formWidgetIdentity(widget);
    const matches = afterByIdentity.get(key) ?? [];
    matches.push(widget);
    afterByIdentity.set(key, matches);
  }
  for (const widget of before) {
    const key = formWidgetIdentity(widget);
    const matches = afterByIdentity.get(key);
    const found = matches?.shift();
    if (!found) {
      failures.push("An existing interactive form widget changed identity or disappeared.");
      continue;
    }
    if (widget.defaultValue !== found.defaultValue || widget.editable !== found.editable || widget.password !== found.password) {
      failures.push("Existing form field attributes changed unexpectedly.");
    }
    const explicit = updates.get(widget.name);
    if (explicit !== undefined) {
      if (found.value !== explicit) failures.push("An authorized form field update did not produce its exact requested value.");
    } else if (expectations.clearFormValues && widget.editable && !widget.password && widget.type !== "signature") {
      if (!clearedFormValue(found)) failures.push("Form clearing left a nonempty editable field.");
    } else if (widget.value !== found.value) {
      failures.push("An existing form field value changed without authorization.");
    }
  }
  const remaining = [...afterByIdentity.values()].flat();
  const used = new Set<number>();
  for (const widget of remaining) {
    const index = additions.findIndex((added, at) =>
      !used.has(at) && added.name === widget.name && added.pageNumber === widget.pageNumber
      && added.type === widget.type && widget.value === JSON.stringify(added.value)
    );
    if (index < 0) failures.push("An unexpected interactive form widget was added.");
    else used.add(index);
  }
  if (used.size !== additions.length) failures.push("An authorized interactive form field was missing or altered.");
}

export function comparePdfFidelityProfiles(
  source: PdfFidelityProfile,
  output: PdfFidelityProfile,
  expectations: PdfFidelityExpectations = {}
): PdfFidelityReport {
  const failures: string[] = [];
  const warnings: string[] = [];
  const affected = new Set(source.affectedPages);
  const sourceGeometry = geometryMap(source);
  const outputGeometry = geometryMap(output);
  const sourceSemantics = semanticMap(source);
  const outputSemantics = semanticMap(output);

  if (source.pageCount !== output.pageCount) failures.push(`Page count changed from ${source.pageCount} to ${output.pageCount}.`);
  const expectedEncrypted = expectations.expectedEncrypted ?? source.container.encrypted;
  if (output.container.encrypted !== expectedEncrypted) failures.push(`PDF encryption state did not match the expected output state (${expectedEncrypted ? "encrypted" : "unencrypted"}).`);
  if (source.outlineEntries !== output.outlineEntries) failures.push(`Outline entry count changed from ${source.outlineEntries} to ${output.outlineEntries}.`);
  const expectedAttachments = expectations.expectedAttachmentCount ?? source.attachmentCount;
  if (output.attachmentCount !== expectedAttachments) failures.push(`Attachment count is ${output.attachmentCount}; expected ${expectedAttachments}.`);
  const expectedFormFields = expectations.expectedFormFieldCount ?? source.formFieldCount;
  if (output.formFieldCount !== expectedFormFields) failures.push(`Form field count is ${output.formFieldCount}; expected ${expectedFormFields}.`);
  compareFormWidgets(source, output, expectations, failures);
  if (expectations.expectedHasJavaScript !== undefined) {
    if (output.hasJavaScript !== expectations.expectedHasJavaScript) {
      failures.push(`Document JavaScript presence did not match the expected output state (${expectations.expectedHasJavaScript ? "present" : "absent"}).`);
    }
  } else if (expectations.allowJavaScriptRemoval) {
    if (!source.hasJavaScript && output.hasJavaScript) failures.push("Document JavaScript was introduced unexpectedly.");
  } else if (source.hasJavaScript !== output.hasJavaScript) {
    failures.push("Document JavaScript presence changed unexpectedly.");
  }
  if (source.pageLabelsDigest !== output.pageLabelsDigest) failures.push("Page labels changed unexpectedly.");
  compareCoreMetadata(source.coreMetadata, output.coreMetadata, failures, expectations.coreMetadataMode);

  for (const pageNumber of source.sampledPages) {
    const beforeGeometry = sourceGeometry.get(pageNumber);
    const afterGeometry = outputGeometry.get(pageNumber);
    if (!beforeGeometry || !afterGeometry) {
      failures.push(`Page ${pageNumber} could not be reopened for geometry validation.`);
      continue;
    }
    if (!sameView(beforeGeometry, afterGeometry)) failures.push(`Page ${pageNumber} crop/view box, rotation, or UserUnit changed unexpectedly.`);

    const before = sourceSemantics.get(pageNumber);
    const after = outputSemantics.get(pageNumber);
    if (!before || !after) {
      failures.push(`Page ${pageNumber} could not be reopened for semantic validation.`);
      continue;
    }

    if (affected.has(pageNumber)) {
      const expectedWidgets = expectations.expectNoWidgetsOnAffectedPages
        ? 0
        : before.widgetCount + (expectations.widgetDeltaByPage?.[pageNumber] ?? 0);
      if (after.widgetCount !== expectedWidgets) {
        failures.push(`Page ${pageNumber} widget count is ${after.widgetCount}; expected ${expectedWidgets}.`);
      }
      continue;
    }

    if (before.textCharacters !== after.textCharacters || before.textDigest !== after.textDigest) failures.push(`Untouched page ${pageNumber} text extraction changed.`);
    if (before.imageOperations !== after.imageOperations) failures.push(`Untouched page ${pageNumber} image operation count changed.`);
    if (before.vectorOperations !== after.vectorOperations) failures.push(`Untouched page ${pageNumber} vector operation count changed.`);
    if (before.annotationCount !== after.annotationCount) failures.push(`Untouched page ${pageNumber} annotation count changed.`);
    if (before.linkCount !== after.linkCount) failures.push(`Untouched page ${pageNumber} link count changed.`);
    if (before.widgetCount !== after.widgetCount) failures.push(`Untouched page ${pageNumber} widget count changed.`);
  }

  const sampledAffectedPages = source.sampledPages.filter((page) => affected.has(page));
  if (sampledAffectedPages.length < source.affectedPages.length) {
    warnings.push(`P8 bounded compatibility sampling checked ${sampledAffectedPages.length} of ${source.affectedPages.length} affected pages plus deterministic document anchors.`);
  }
  if (source.container.incrementalUpdates > 1 || source.container.previousXref) warnings.push("Source contains incremental revisions; edited output may normalize revision history while preserving validated document semantics.");
  if (source.container.linearized) warnings.push("Source is linearized for fast web viewing; editing may normalize linearization while preserving validated document semantics.");
  if (source.container.objectStreams !== output.container.objectStreams) warnings.push("Object-stream packing changed during export; semantic fidelity checks still passed.");
  if (source.container.xrefStreams !== output.container.xrefStreams) warnings.push("Cross-reference stream representation changed during export; semantic fidelity checks still passed.");

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    sampledPages: source.sampledPages,
    sampledAffectedPages,
    affectedPageCount: source.affectedPages.length
  };
}

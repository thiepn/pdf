import * as mupdf from "mupdf";
import type {
  NativeCapability,
  NativeComplexContentKind,
  NativeComplexEdit,
  NativeComplexObject,
  NativeExportReport,
  NativeRect
} from "../types/nativeEditor";

type Request =
  | { type: "INSPECT_COMPLEX"; requestId: string; bytes: ArrayBuffer; password?: string }
  | { type: "APPLY_COMPLEX"; requestId: string; bytes: ArrayBuffer; password?: string; edits?: NativeComplexEdit[] }
  | { type: "CANCEL"; requestId: string };

type PdfDocument = any;
type PdfPage = any;
type PdfObject = any;
type Matrix = [number, number, number, number, number, number];

type Operand = number | string;

interface Token {
  value: string;
  start: number;
  end: number;
  kind: "number" | "name" | "word" | "string";
}

interface GraphicsState {
  ctm: Matrix;
  clipped: boolean;
  pendingClip: boolean;
}

interface ParsedComplex {
  object: NativeComplexObject;
  streamIndex: number;
  invocationIndex: number;
  start: number;
  end: number;
  ctm: Matrix;
}

interface ComplexPageInspection {
  pageNumber: number;
  complex: NativeComplexObject[];
  warnings: string[];
}

interface ComplexInspection {
  pages: ComplexPageInspection[];
  total: number;
  warnings: string[];
}

const cancelled = new Set<string>();
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function active(id: string): void {
  if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError");
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function auth(pdf: PdfDocument, password?: string): void {
  if (pdf.needsPassword?.() && (!password || pdf.authenticatePassword(password) === 0)) throw new Error("The PDF password is required or incorrect.");
}

function finite(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function inverse(matrix: Matrix): Matrix | undefined {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return undefined;
  return [d / determinant, -b / determinant, -c / determinant, a / determinant, (c * f - d * e) / determinant, (b * e - a * f) / determinant];
}

function point(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

function pageToPdfMatrix(page: PdfPage): Matrix {
  const value = page.getTransform?.() ?? IDENTITY;
  return [finite(value[0], 1), finite(value[1]), finite(value[2]), finite(value[3], 1), finite(value[4]), finite(value[5])];
}

function pdfToPageMatrix(page: PdfPage): Matrix {
  return inverse(pageToPdfMatrix(page)) ?? [...IDENTITY];
}

function isWhitespace(code: number): boolean {
  return code === 0 || code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

function isDelimiter(code: number): boolean {
  return isWhitespace(code) || [40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(code);
}

function skipLiteralString(source: string, start: number): number {
  let depth = 1;
  let index = start + 1;
  while (index < source.length && depth > 0) {
    const code = source.charCodeAt(index);
    if (code === 92) { index += 2; continue; }
    if (code === 40) depth += 1;
    else if (code === 41) depth -= 1;
    index += 1;
  }
  return index;
}

function skipArray(source: string, start: number): number {
  let depth = 1;
  let index = start + 1;
  while (index < source.length && depth > 0) {
    const code = source.charCodeAt(index);
    if (code === 40) { index = skipLiteralString(source, index); continue; }
    if (code === 91) depth += 1;
    else if (code === 93) depth -= 1;
    index += 1;
  }
  return index;
}

function tokenize(source: string): { tokens: Token[]; inlineImage: boolean } {
  const tokens: Token[] = [];
  let index = 0;
  let inlineImage = false;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (isWhitespace(code)) { index += 1; continue; }
    if (code === 37) {
      while (index < source.length && ![10, 13].includes(source.charCodeAt(index))) index += 1;
      continue;
    }
    if (code === 40) {
      const end = skipLiteralString(source, index);
      tokens.push({ value: source.slice(index, end), start: index, end, kind: "string" });
      index = end;
      continue;
    }
    if (code === 91) {
      index = skipArray(source, index);
      continue;
    }
    if (code === 60 && source.charCodeAt(index + 1) !== 60) {
      const start = index++;
      while (index < source.length && source.charCodeAt(index) !== 62) index += 1;
      index = Math.min(source.length, index + 1);
      tokens.push({ value: source.slice(start, index), start, end: index, kind: "string" });
      continue;
    }
    if (code === 47) {
      const start = index++;
      while (index < source.length && !isDelimiter(source.charCodeAt(index))) index += 1;
      tokens.push({ value: source.slice(start, index), start, end: index, kind: "name" });
      continue;
    }
    const start = index++;
    while (index < source.length && !isDelimiter(source.charCodeAt(index))) index += 1;
    const value = source.slice(start, index);
    if (value === "BI") inlineImage = true;
    tokens.push({ value, start, end: index, kind: Number.isFinite(Number(value)) ? "number" : "word" });
  }
  return { tokens, inlineImage };
}

function tokenOperand(token: Token): Operand | undefined {
  if (token.kind === "number") return Number(token.value);
  if (token.kind === "name") return token.value.slice(1);
  return undefined;
}

function byteString(bytes: Uint8Array): string {
  let result = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) result += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk)));
  return result;
}

function bytesFromByteString(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function streamBytes(ref: PdfObject): Uint8Array {
  const buffer = ref.readStream();
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy?.(); }
}

function contentStreams(page: PdfPage): PdfObject[] {
  const contents = page.getObject().get("Contents");
  if (!contents || contents.isNull?.()) return [];
  if (contents.isArray?.()) {
    const streams: PdfObject[] = [];
    for (let index = 0; index < Number(contents.length ?? 0); index += 1) {
      const item = contents.get(index);
      if (item?.isStream?.()) streams.push(item);
    }
    return streams;
  }
  return contents.isStream?.() ? [contents] : [];
}

function pageResources(page: PdfPage): PdfObject | undefined {
  const object = page.getObject();
  const own = object.get("Resources");
  if (own?.isDictionary?.()) return own;
  const inherited = object.getInheritable?.("Resources");
  return inherited?.isDictionary?.() ? inherited : undefined;
}

function resolvedXObject(resources: PdfObject | undefined, name: string): PdfObject | undefined {
  const dictionary = resources?.get?.("XObject");
  if (!dictionary?.isDictionary?.()) return undefined;
  const raw = dictionary.get(name);
  const resolved = raw?.resolve?.() ?? raw;
  return resolved?.isStream?.() ? resolved : undefined;
}

function objectName(object: PdfObject | undefined, key: string): string {
  return String(object?.get?.(key)?.valueOf?.() ?? "").replace(/^\//, "");
}

function arrayNumbers(object: PdfObject | undefined, key: string, fallback: number[]): number[] {
  const array = object?.get?.(key);
  if (!array?.isArray?.()) return [...fallback];
  const result: number[] = [];
  for (let index = 0; index < Number(array.length ?? 0); index += 1) result.push(finite(array.get(index)?.valueOf?.(), fallback[index] ?? 0));
  return result.length ? result : [...fallback];
}

function formMatrix(form: PdfObject): Matrix {
  const values = arrayNumbers(form, "Matrix", IDENTITY);
  return [finite(values[0], 1), finite(values[1]), finite(values[2]), finite(values[3], 1), finite(values[4]), finite(values[5])];
}

function formBBox(form: PdfObject): [number, number, number, number] | undefined {
  const values = arrayNumbers(form, "BBox", []);
  if (values.length < 4 || values.slice(0, 4).some((value) => !Number.isFinite(value))) return undefined;
  return [values[0], values[1], values[2], values[3]];
}

function transformedRect(matrix: Matrix, bbox: [number, number, number, number]): NativeRect {
  const x0 = Math.min(bbox[0], bbox[2]);
  const y0 = Math.min(bbox[1], bbox[3]);
  const x1 = Math.max(bbox[0], bbox[2]);
  const y1 = Math.max(bbox[1], bbox[3]);
  const corners = [point(matrix, x0, y0), point(matrix, x1, y0), point(matrix, x1, y1), point(matrix, x0, y1)];
  const left = Math.min(...corners.map((item) => item[0]));
  const top = Math.min(...corners.map((item) => item[1]));
  const right = Math.max(...corners.map((item) => item[0]));
  const bottom = Math.max(...corners.map((item) => item[1]));
  return { x: left, y: top, w: Math.max(0.01, right - left), h: Math.max(0.01, bottom - top) };
}

function formContentKinds(form: PdfObject): NativeComplexContentKind[] {
  const kinds = new Set<NativeComplexContentKind>();
  const source = safe(() => byteString(streamBytes(form)), "");
  if (/\bBT\b/.test(source)) kinds.add("text");
  if (/(?:\bm\b|\bl\b|\bc\b|\bre\b)[\s\S]*?(?:\bS\b|\bf\*?\b|\bB\*?\b)/.test(source)) kinds.add("vector");
  const resources = form.get("Resources");
  const names = [...source.matchAll(/\/([^\s<>\[\]()/%]+)\s+Do\b/g)].map((match) => match[1]);
  for (const name of names) {
    const nested = resolvedXObject(resources?.isDictionary?.() ? resources : undefined, name);
    const subtype = objectName(nested, "Subtype");
    if (subtype === "Image") kinds.add("image");
    else if (subtype === "Form") kinds.add("form");
    else kinds.add("unknown");
  }
  if (/\bBI\b/.test(source)) kinds.add("image");
  if (!kinds.size) kinds.add("unknown");
  return [...kinds];
}

function capability(clipped: boolean, invertible: boolean): NativeCapability {
  if (!invertible) return {
    level: "unsupported",
    label: "Nested group protected",
    confidence: 1,
    reason: "This Form XObject instance uses a non-invertible placement matrix, so an isolated instance transform cannot be derived safely.",
    preserves: ["Shared nested Form XObject", "Other instances"],
    risks: ["Editing is intentionally disabled instead of guessing a transform."]
  };
  return {
    level: clipped ? "safe-reconstruction" : "native-safe",
    label: clipped ? "Clipped nested group" : "Nested PDF group",
    confidence: clipped ? 0.92 : 0.98,
    reason: "This is a page-level Form XObject instance. P7 can rewrite only this invocation while leaving the shared nested object and every other instance unchanged.",
    preserves: ["Shared Form XObject contents", "Other instances of the same Form", "Nested text, images and vector operators", "Page resources"],
    risks: clipped ? ["The group remains subject to its original page clipping boundary, so moving it may reveal or hide different portions."] : []
  };
}

function signature(resourceName: string, bounds: NativeRect): string {
  return `${resourceName}:${round(bounds.x)},${round(bounds.y)},${round(bounds.w)},${round(bounds.h)}`;
}

function parseStream(page: PdfPage, source: string, streamIndex: number): { records: ParsedComplex[]; inlineImage: boolean } {
  const { tokens, inlineImage } = tokenize(source);
  if (inlineImage) return { records: [], inlineImage: true };
  const resources = pageResources(page);
  const records: ParsedComplex[] = [];
  const stateStack: GraphicsState[] = [];
  let state: GraphicsState = { ctm: [...IDENTITY], clipped: false, pendingClip: false };
  const operands: Array<{ value: Operand; token: Token }> = [];
  let invocationIndex = 0;

  for (const token of tokens) {
    const operand = tokenOperand(token);
    if (operand !== undefined) { operands.push({ value: operand, token }); continue; }
    const op = token.value;
    if (op === "q") {
      stateStack.push({ ctm: [...state.ctm], clipped: state.clipped, pendingClip: state.pendingClip });
      operands.length = 0;
      continue;
    }
    if (op === "Q") {
      state = stateStack.pop() ?? { ctm: [...IDENTITY], clipped: false, pendingClip: false };
      operands.length = 0;
      continue;
    }
    if (op === "cm") {
      const values = operands.slice(-6).map((item) => Number(item.value));
      if (values.length === 6 && values.every(Number.isFinite)) state.ctm = multiply(state.ctm, values as Matrix);
      operands.length = 0;
      continue;
    }
    if (op === "W" || op === "W*") {
      state.pendingClip = true;
      operands.length = 0;
      continue;
    }
    if (["n", "S", "s", "f", "F", "f*", "B", "B*", "b", "b*"].includes(op) && state.pendingClip) {
      state.clipped = true;
      state.pendingClip = false;
      operands.length = 0;
      continue;
    }
    if (op === "Do") {
      const nameOperand = operands.at(-1);
      const resourceName = typeof nameOperand?.value === "string" ? nameOperand.value : "";
      const form = resourceName ? resolvedXObject(resources, resourceName) : undefined;
      if (form && objectName(form, "Subtype") === "Form") {
        const bbox = formBBox(form);
        if (bbox) {
          const pdfMatrix = multiply(state.ctm, formMatrix(form));
          const pageMatrix = multiply(pdfToPageMatrix(page), pdfMatrix);
          const bounds = transformedRect(pageMatrix, bbox);
          const invertible = Boolean(inverse(state.ctm));
          const cap = capability(state.clipped, invertible);
          const object: NativeComplexObject = {
            id: `p0:complex:s${streamIndex}:x${invocationIndex}:${resourceName}`,
            type: "complex",
            pageNumber: 0,
            bounds,
            resourceName,
            sourceStreamIndex: streamIndex,
            sourceInvocationIndex: invocationIndex,
            sourceSignature: signature(resourceName, bounds),
            instanceCount: 1,
            contentKinds: formContentKinds(form),
            clipped: state.clipped,
            editability: invertible ? "instance-transform" : "unsupported",
            capability: cap
          };
          records.push({ object, streamIndex, invocationIndex, start: nameOperand?.token.start ?? token.start, end: token.end, ctm: [...state.ctm] });
        }
        invocationIndex += 1;
      }
      operands.length = 0;
      continue;
    }
    operands.length = 0;
  }
  return { records, inlineImage: false };
}

function inspectPage(page: PdfPage, pageNumber: number): ComplexPageInspection {
  const warnings: string[] = [];
  const records: ParsedComplex[] = [];
  const streams = contentStreams(page);
  streams.forEach((stream, streamIndex) => {
    const parsed = parseStream(page, byteString(streamBytes(stream)), streamIndex);
    if (parsed.inlineImage) {
      warnings.push(`Page ${pageNumber} content stream ${streamIndex + 1} contains an inline image; P7 nested-instance rewriting in that stream is disabled to preserve binary image data.`);
      return;
    }
    records.push(...parsed.records);
  });
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.object.resourceName, (counts.get(record.object.resourceName) ?? 0) + 1);
  const complex = records.map((record) => ({
    ...record.object,
    id: `p${pageNumber}:complex:s${record.streamIndex}:x${record.invocationIndex}:${record.object.resourceName}`,
    pageNumber,
    instanceCount: counts.get(record.object.resourceName) ?? 1
  }));
  return { pageNumber, complex, warnings };
}

function inspect(pdf: PdfDocument, requestId: string): ComplexInspection {
  const pages: ComplexPageInspection[] = [];
  const warnings: string[] = [];
  let total = 0;
  for (let index = 0; index < pdf.countPages(); index += 1) {
    active(requestId);
    const page = pdf.loadPage(index);
    try {
      const result = inspectPage(page, index + 1);
      pages.push(result);
      total += result.complex.length;
      warnings.push(...result.warnings);
    } finally { page.destroy?.(); }
  }
  return { pages, total, warnings };
}

function rectDistance(a: NativeRect, b: NativeRect): number {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  return Math.hypot(acx - bcx, acy - bcy) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h);
}

function findRecord(page: PdfPage, edit: NativeComplexEdit): { record: ParsedComplex; stream: PdfObject; source: string } {
  const candidates: Array<{ record: ParsedComplex; stream: PdfObject; source: string }> = [];
  const streams = contentStreams(page);
  streams.forEach((stream, streamIndex) => {
    const source = byteString(streamBytes(stream));
    const parsed = parseStream(page, source, streamIndex);
    if (parsed.inlineImage) return;
    for (const record of parsed.records) if (record.object.resourceName === edit.resourceName) candidates.push({ record, stream, source });
  });
  if (!candidates.length) throw new Error(`P7 nested source /${edit.resourceName} was not found on page ${edit.pageNumber}.`);
  const indexed = candidates.find((candidate) => candidate.record.streamIndex === edit.sourceStreamIndex && candidate.record.invocationIndex === edit.sourceInvocationIndex);
  if (indexed && rectDistance(indexed.record.object.bounds, edit.sourceBounds) <= Math.max(18, edit.sourceBounds.w * .25 + edit.sourceBounds.h * .25)) return indexed;
  const exactSignature = candidates.find((candidate) => candidate.record.object.sourceSignature === edit.sourceSignature);
  if (exactSignature) return exactSignature;
  const nearest = [...candidates].sort((a, b) => rectDistance(a.record.object.bounds, edit.sourceBounds) - rectDistance(b.record.object.bounds, edit.sourceBounds))[0];
  if (rectDistance(nearest.record.object.bounds, edit.sourceBounds) > Math.max(24, edit.sourceBounds.w * .45 + edit.sourceBounds.h * .45)) throw new Error(`P7 could not match nested source /${edit.resourceName} safely on page ${edit.pageNumber}.`);
  return nearest;
}

function translate(x: number, y: number): Matrix { return [1, 0, 0, 1, x, y]; }
function scale(x: number, y: number): Matrix { return [x, 0, 0, y, 0, 0]; }
function rotate(degrees: number): Matrix {
  const radians = degrees * Math.PI / 180;
  return [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];
}

function pageDestinationTransform(edit: NativeComplexEdit): Matrix {
  const source = edit.sourceBounds;
  const destination = edit.bounds;
  const sx = Math.abs(source.w) > 1e-9 ? destination.w / source.w : 1;
  const sy = Math.abs(source.h) > 1e-9 ? destination.h / source.h : 1;
  let result = multiply(translate(destination.x, destination.y), multiply(scale(sx, sy), translate(-source.x, -source.y)));
  if (Math.abs(edit.rotation) > 1e-9) {
    const cx = destination.x + destination.w / 2;
    const cy = destination.y + destination.h / 2;
    result = multiply(translate(cx, cy), multiply(rotate(edit.rotation), multiply(translate(-cx, -cy), result)));
  }
  return result;
}

function localTransform(page: PdfPage, record: ParsedComplex, edit: NativeComplexEdit): Matrix {
  const inverseCurrent = inverse(record.ctm);
  if (!inverseCurrent) throw new Error(`P7 nested source /${edit.resourceName} has a non-invertible placement matrix.`);
  const pageToPdf = pageToPdfMatrix(page);
  const pdfToPage = pdfToPageMatrix(page);
  const destinationPage = pageDestinationTransform(edit);
  const destinationPdf = multiply(pageToPdf, multiply(destinationPage, pdfToPage));
  return multiply(inverseCurrent, multiply(destinationPdf, record.ctm));
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100000) / 100000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function replacement(page: PdfPage, record: ParsedComplex, edit: NativeComplexEdit): string {
  if (edit.action === "delete") return "";
  const matrix = localTransform(page, record, edit);
  return `q\n${matrix.map(formatNumber).join(" ")} cm\n/${edit.resourceName} Do\nQ`;
}

function save(pdf: PdfDocument): Uint8Array {
  const buffer = pdf.saveToBuffer("compress=yes,encrypt=keep");
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy?.(); }
}

function groupCounts(inspection: ComplexInspection): Map<string, number> {
  const counts = new Map<string, number>();
  for (const page of inspection.pages) for (const object of page.complex) {
    const key = `${page.pageNumber}:${object.resourceName}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function apply(pdf: PdfDocument, edits: NativeComplexEdit[], requestId: string): { output: Uint8Array; report: NativeExportReport } {
  const startedAt = performance.now();
  const beforeInspection = inspect(pdf, requestId);
  const beforeCounts = groupCounts(beforeInspection);
  const changed = new Set<number>();
  const warnings: string[] = [];

  for (const edit of edits) {
    active(requestId);
    const page = pdf.loadPage(edit.pageNumber - 1);
    try {
      const match = findRecord(page, edit);
      if (match.record.object.editability === "unsupported") throw new Error(`P7 nested source /${edit.resourceName} cannot be transformed safely.`);
      const next = match.source.slice(0, match.record.start) + replacement(page, match.record, edit) + match.source.slice(match.record.end);
      match.stream.writeStream(bytesFromByteString(next));
      changed.add(edit.pageNumber);
      if (match.record.object.clipped && edit.action === "transform") warnings.push(`Nested group /${edit.resourceName} remains subject to its original page clipping boundary.`);
    } finally { page.destroy?.(); }
  }

  const output = save(pdf);
  const reopened = new (mupdf as any).PDFDocument(output);
  try {
    if (reopened.countPages() !== pdf.countPages()) throw new Error("P7 nested-content validation failed: page count changed.");
    const afterInspection = inspect(reopened, requestId);
    const afterCounts = groupCounts(afterInspection);
    const deletesByKey = new Map<string, number>();
    for (const edit of edits) if (edit.action === "delete") {
      const key = `${edit.pageNumber}:${edit.resourceName}`;
      deletesByKey.set(key, (deletesByKey.get(key) ?? 0) + 1);
    }
    for (const [key, count] of deletesByKey) {
      const expected = Math.max(0, (beforeCounts.get(key) ?? 0) - count);
      if ((afterCounts.get(key) ?? 0) !== expected) throw new Error(`P7 nested-content validation failed: deleted instance count for ${key} is incorrect.`);
    }
    for (const edit of edits.filter((candidate) => candidate.action === "transform")) {
      const page = afterInspection.pages.find((candidate) => candidate.pageNumber === edit.pageNumber);
      const candidates = page?.complex.filter((candidate) => candidate.resourceName === edit.resourceName) ?? [];
      const expected = edit.bounds;
      if (!candidates.some((candidate) => rectDistance(candidate.bounds, expected) <= Math.max(22, expected.w * .35 + expected.h * .35))) throw new Error(`P7 nested-content validation failed: transformed /${edit.resourceName} instance was not found near its destination.`);
    }
    return {
      output,
      report: {
        operation: "native-content-edit",
        pageCount: reopened.countPages(),
        outputBytes: output.byteLength,
        changedPages: [...changed].sort((a, b) => a - b),
        textEdits: 0,
        imageEdits: 0,
        vectorEdits: 0,
        tableCellEdits: 0,
        formEdits: 0,
        complexEdits: edits.length,
        warnings: [
          "P7 edits only page-level Form XObject invocations; shared nested Form streams and other instances are not rewritten.",
          ...warnings
        ],
        durationMs: performance.now() - startedAt
      }
    };
  } finally { reopened.destroy?.(); }
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  void (async () => {
    let pdf: PdfDocument | undefined;
    try {
      pdf = new (mupdf as any).PDFDocument(new Uint8Array(request.bytes));
      auth(pdf, request.password);
      safe(() => pdf.checkSyntax(), 0);
      if (request.type === "INSPECT_COMPLEX") {
        self.postMessage({ type: "COMPLEX_INSPECTION", requestId: request.requestId, inspection: inspect(pdf, request.requestId) });
        return;
      }
      const result = apply(pdf, request.edits ?? [], request.requestId);
      const transferable = result.output.buffer.slice(result.output.byteOffset, result.output.byteOffset + result.output.byteLength);
      self.postMessage({ type: "NATIVE_RESULT", requestId: request.requestId, output: transferable, report: result.report }, [transferable]);
    } catch (error) {
      self.postMessage({ type: "NATIVE_ERROR", requestId: request.requestId, error: { message: error instanceof Error ? error.message : String(error) } });
    } finally {
      pdf?.destroy?.();
      cancelled.delete(request.requestId);
    }
  })();
};

self.postMessage({ type: "READY" });

import * as mupdf from "mupdf";
import type { AffineMatrix, Point, Rect } from "../core/coordinates";
import type {
  FormFieldType,
  FormFieldUpdate,
  SecurityExportOptions,
  SecurityExportReport,
  SecurityFormField,
  SecurityInspectionReport,
  SignatureInspection
} from "../types/security";
import { permissionMask } from "../security/securityModel";

interface InspectRequest {
  type: "INSPECT_SECURITY";
  requestId: string;
  bytes: ArrayBuffer;
  password?: string;
}

interface ApplyRequest {
  type: "APPLY_SECURITY";
  requestId: string;
  bytes: ArrayBuffer;
  password?: string;
  options: SecurityExportOptions;
}

interface CancelRequest { type: "CANCEL"; requestId: string }
type Request = InspectRequest | ApplyRequest | CancelRequest;
const cancelled = new Set<string>();

function assertActive(requestId: string): void {
  if (cancelled.has(requestId)) throw new DOMException("Operation cancelled.", "AbortError");
}

function point(matrix: AffineMatrix, value: Point): Point {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * value.x + c * value.y + e, y: b * value.x + d * value.y + f };
}

function transformRect(matrix: AffineMatrix, value: number[]): Rect {
  const points = [
    point(matrix, { x: value[0], y: value[1] }),
    point(matrix, { x: value[2], y: value[1] }),
    point(matrix, { x: value[2], y: value[3] }),
    point(matrix, { x: value[0], y: value[3] })
  ];
  return {
    x0: Math.min(...points.map((item) => item.x)),
    y0: Math.min(...points.map((item) => item.y)),
    x1: Math.max(...points.map((item) => item.x)),
    y1: Math.max(...points.map((item) => item.y))
  };
}

function authenticate(document: any, password?: string): "none" | "user" | "owner" | "user-and-owner" {
  if (!document.needsPassword()) return "none";
  const result = password ? document.authenticatePassword(password) : 0;
  if (!result) throw new Error("The PDF password is required or incorrect.");
  if ((result & 6) === 6) return "user-and-owner";
  if (result & 4) return "owner";
  return "user";
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function safeCall<T>(callback: () => T, fallback: T): T {
  try { return callback(); } catch { return fallback; }
}

function getPath(object: any, ...path: Array<string | number>): any {
  let current = object;
  for (const key of path) {
    if (!current?.get) return null;
    current = current.get(key);
  }
  return current;
}

function objectExists(object: any, ...path: Array<string | number>): boolean {
  try { return Boolean(getPath(object, ...path)); } catch { return false; }
}

function deletePath(object: any, key: string): boolean {
  try {
    if (!object?.get?.(key)) return false;
    object.delete?.(key);
    return true;
  } catch { return false; }
}

function countNameTreeEntries(root: any, key: string): number {
  try {
    const tree = getPath(root, "Names", key);
    const names = tree?.get?.("Names");
    if (names && typeof names.length === "number") return Math.floor(names.length / 2);
    return tree ? 1 : 0;
  } catch { return 0; }
}

function widgetType(widget: any): FormFieldType {
  const type = safeString(safeCall(() => widget.getFieldType(), "unknown"));
  return (["button", "checkbox", "combobox", "listbox", "radiobutton", "signature", "text"] as string[]).includes(type) ? type as FormFieldType : "unknown";
}

function inspectWidget(widget: any, pageNumber: number, widgetIndex: number, transform: AffineMatrix): { field: SecurityFormField; signature?: SignatureInspection } {
  const type = widgetType(widget);
  const name = safeString(safeCall(() => widget.getName(), ""));
  const id = `${pageNumber}:${widgetIndex}:${name || type}`;
  const rect = safeCall(() => transformRect(transform, widget.getRect()), { x0: 0, y0: 0, x1: 0, y1: 0 });
  const signatureValue = type === "signature" ? safeCall(() => widget.getObject?.()?.get?.("V"), null) : null;
  const signed = type === "signature"
    ? (typeof widget.isSigned === "function" ? safeCall(() => Boolean(widget.isSigned()), false) : Boolean(signatureValue))
    : null;
  const password = Boolean(safeCall(() => widget.isPassword(), false));
  const field: SecurityFormField = {
    id,
    pageNumber,
    widgetIndex,
    type,
    name,
    label: safeString(safeCall(() => widget.getLabel(), name)),
    value: password ? "" : safeString(safeCall(() => widget.getValue(), "")),
    options: safeCall(() => widget.getOptions(), [] as string[]).map(String),
    rect,
    readOnly: Boolean(safeCall(() => widget.isReadOnly(), false)),
    multiline: Boolean(safeCall(() => widget.isMultiline(), false)),
    password,
    comb: Boolean(safeCall(() => widget.isComb(), false)),
    signed
  };
  if (type !== "signature") return { field };
  const validationSupported = typeof widget.checkDigest === "function" || typeof widget.validateSignature === "function";
  return {
    field,
    signature: {
      id,
      pageNumber,
      name: name || `Signature ${widgetIndex + 1}`,
      signed,
      signatory: signed && typeof widget.getSignatory === "function" ? safeString(safeCall(() => widget.getSignatory(), "")) : undefined,
      digestStatus: signed && typeof widget.checkDigest === "function" ? safeString(safeCall(() => widget.checkDigest(), "Unavailable")) : undefined,
      certificateStatus: signed && typeof widget.checkCertificate === "function" ? safeString(safeCall(() => widget.checkCertificate(), "Unavailable")) : undefined,
      changesSinceSigning: signed && typeof widget.incrementalChangesSinceSigning === "function" ? Boolean(safeCall(() => widget.incrementalChangesSinceSigning(), false)) : null,
      validationSupported
    }
  };
}

function inspectDocument(document: any, authentication: SecurityInspectionReport["authentication"]): SecurityInspectionReport {
  const pdf = document.asPDF();
  if (!pdf) throw new Error("The document is not a PDF.");
  pdf.disableJS?.();
  const trailer = pdf.getTrailer?.();
  const root = trailer?.get?.("Root");
  const formFields: SecurityFormField[] = [];
  const signatures: SignatureInspection[] = [];
  let annotationCount = 0;
  let redactionMarkCount = 0;
  let linkCount = 0;

  for (let pageIndex = 0; pageIndex < pdf.countPages(); pageIndex += 1) {
    const page = pdf.loadPage(pageIndex);
    try {
      const transform = page.getTransform() as AffineMatrix;
      const widgets = safeCall(() => page.getWidgets(), [] as any[]);
      widgets.forEach((widget: any, widgetIndex: number) => {
        const inspected = inspectWidget(widget, pageIndex + 1, widgetIndex, transform);
        formFields.push(inspected.field);
        if (inspected.signature) signatures.push(inspected.signature);
      });
      linkCount += safeCall(() => page.getLinks(), [] as any[]).length;
      const annotations = safeCall(() => page.getAnnotations(), [] as any[]);
      for (const annotation of annotations) {
        const type = safeString(safeCall(() => annotation.getType(), ""));
        if (type === "Redaction" || type === "Redact") redactionMarkCount += 1;
        else annotationCount += 1;
      }
    } finally { page.destroy(); }
  }

  const metadata: Record<string, string> = {};
  for (const key of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"]) {
    const value = safeString(safeCall(() => pdf.getMetaData(`info:${key}`), ""));
    if (value) metadata[key] = value;
  }

  return {
    pageCount: pdf.countPages(),
    encrypted: document.needsPassword() || Boolean(safeCall(() => document.getMetaData("encryption"), "")),
    authentication,
    encryptionDescription: safeString(safeCall(() => document.getMetaData("encryption"), "")) || "None",
    permissions: {
      print: Boolean(safeCall(() => document.hasPermission("print"), true)),
      edit: Boolean(safeCall(() => document.hasPermission("edit"), true)),
      copy: Boolean(safeCall(() => document.hasPermission("copy"), true)),
      annotate: Boolean(safeCall(() => document.hasPermission("annotate"), true)),
      form: Boolean(safeCall(() => document.hasPermission("form"), true)),
      accessibility: Boolean(safeCall(() => document.hasPermission("accessibility"), true)),
      assemble: Boolean(safeCall(() => document.hasPermission("assemble"), true)),
      printHighQuality: Boolean(safeCall(() => document.hasPermission("print-hq"), true))
    },
    versionCount: Number(safeCall(() => pdf.countVersions(), 1)),
    changeHistoryStatus: typeof pdf.validateChangeHistory === "function" ? Number(safeCall(() => pdf.validateChangeHistory(), -1)) : null,
    repaired: Boolean(safeCall(() => pdf.wasRepaired(), false)),
    formFields,
    signatures,
    annotationCount,
    redactionMarkCount,
    linkCount,
    attachmentCount: countNameTreeEntries(root, "EmbeddedFiles"),
    hasJavaScript: objectExists(root, "Names", "JavaScript") || objectExists(root, "JavaScript"),
    hasOpenAction: objectExists(root, "OpenAction"),
    hasAdditionalActions: objectExists(root, "AA"),
    metadata,
    warnings: [
      ...(formFields.some((field) => field.type === "unknown") ? ["Some form widgets use field types this browser build could not classify."] : []),
      ...(signatures.some((signature) => signature.signed && !signature.validationSupported) ? ["This MuPDF browser build can detect signed fields but cannot fully validate every certificate."] : [])
    ]
  };
}

function applyFormUpdates(pdf: any, updates: FormFieldUpdate[]): number {
  let updated = 0;
  const byPage = new Map<number, FormFieldUpdate[]>();
  for (const update of updates) {
    const items = byPage.get(update.pageNumber) ?? [];
    items.push(update);
    byPage.set(update.pageNumber, items);
  }
  for (const [pageNumber, pageUpdates] of byPage) {
    if (pageNumber < 1 || pageNumber > pdf.countPages()) continue;
    const page = pdf.loadPage(pageNumber - 1);
    try {
      const widgets = safeCall(() => page.getWidgets(), [] as any[]);
      for (const update of pageUpdates) {
        const widget = widgets[update.widgetIndex] ?? widgets.find((candidate: any) => safeCall(() => candidate.getName(), "") === update.name);
        if (!widget || safeCall(() => widget.isReadOnly(), false)) continue;
        const type = widgetType(widget);
        const current = safeString(safeCall(() => widget.getValue(), ""));
        if (current === update.value) continue;
        if (type === "text") widget.setTextValue(update.value);
        else if (type === "combobox" || type === "listbox") widget.setChoiceValue(update.value);
        else if (type === "checkbox" || type === "radiobutton") {
          if (typeof widget.setChoiceValue === "function") widget.setChoiceValue(update.value || "Off");
          else {
            const shouldBeOn = !["", "off", "false", "0", "no"].includes(update.value.toLocaleLowerCase());
            const currentlyOn = !["", "off", "false", "0", "no"].includes(current.toLocaleLowerCase());
            if (shouldBeOn !== currentlyOn) widget.toggle();
          }
        } else continue;
        updated += 1;
      }
      page.update?.();
    } finally { page.destroy(); }
  }
  return updated;
}

function clearFormValues(pdf: any): number {
  let cleared = 0;
  for (let pageIndex = 0; pageIndex < pdf.countPages(); pageIndex += 1) {
    const page = pdf.loadPage(pageIndex);
    try {
      for (const widget of safeCall(() => page.getWidgets(), [] as any[])) {
        if (safeCall(() => widget.isReadOnly(), false)) continue;
        const type = widgetType(widget);
        const current = safeString(safeCall(() => widget.getValue(), ""));
        if (!current || type === "signature") continue;
        if (type === "text") widget.setTextValue("");
        else if (type === "combobox" || type === "listbox") widget.setChoiceValue("");
        else if (type === "checkbox" || type === "radiobutton") {
          if (typeof widget.setChoiceValue === "function") widget.setChoiceValue("Off");
          else widget.toggle();
        } else continue;
        cleared += 1;
      }
      page.update?.();
    } finally { page.destroy(); }
  }
  return cleared;
}

function redactionConstants(options: SecurityExportOptions["redaction"]): [number, number, number] {
  const pageClass = (mupdf as any).PDFPage;
  const image = options.imageMode === "none" ? pageClass.REDACT_IMAGE_NONE
    : options.imageMode === "remove" ? pageClass.REDACT_IMAGE_REMOVE
      : options.imageMode === "unless-invisible" ? pageClass.REDACT_IMAGE_UNLESS_INVISIBLE
        : pageClass.REDACT_IMAGE_PIXELS;
  const line = options.lineArtMode === "none" ? pageClass.REDACT_LINE_ART_NONE
    : options.lineArtMode === "touched" ? pageClass.REDACT_LINE_ART_REMOVE_IF_TOUCHED
      : pageClass.REDACT_LINE_ART_REMOVE_IF_COVERED;
  const text = options.removeText ? pageClass.REDACT_TEXT_REMOVE : pageClass.REDACT_TEXT_NONE;
  return [image, line, text];
}

function applyRedactions(pdf: any, options: SecurityExportOptions["redaction"]): number {
  if (!options.enabled) return 0;
  let count = 0;
  const [image, line, text] = redactionConstants(options);
  for (let pageIndex = 0; pageIndex < pdf.countPages(); pageIndex += 1) {
    const page = pdf.loadPage(pageIndex);
    try {
      const redactions = safeCall(() => page.getAnnotations(), [] as any[]).filter((annotation: any) => {
        const type = safeString(safeCall(() => annotation.getType(), ""));
        return type === "Redaction" || type === "Redact";
      });
      if (!redactions.length) continue;
      count += redactions.length;
      page.applyRedactions(options.blackBoxes, image, line, text);
    } finally { page.destroy(); }
  }
  return count;
}

function removePageContent(pdf: any, options: SecurityExportOptions["sanitization"]): { links: number; comments: number; attachments: number } {
  let links = 0;
  let comments = 0;
  let attachments = 0;
  for (let pageIndex = 0; pageIndex < pdf.countPages(); pageIndex += 1) {
    const page = pdf.loadPage(pageIndex);
    try {
      if (options.removeLinks) {
        const pageLinks = safeCall(() => page.getLinks(), [] as any[]);
        for (const link of pageLinks) { page.deleteLink(link); links += 1; }
      }
      if (options.removeComments || options.removeAttachments) {
        for (const annotation of safeCall(() => page.getAnnotations(), [] as any[])) {
          const type = safeString(safeCall(() => annotation.getType(), ""));
          if (options.removeAttachments && type === "FileAttachment") { page.deleteAnnotation(annotation); attachments += 1; continue; }
          if (options.removeComments && type !== "Redaction" && type !== "Redact") { page.deleteAnnotation(annotation); comments += 1; }
        }
      }
      const pageObject = page.getObject?.();
      if (options.removeAttachments && deletePath(pageObject, "AF")) attachments += 1;
      page.update?.();
    } finally { page.destroy(); }
  }
  return { links, comments, attachments };
}

function sanitizeCatalog(pdf: any, options: SecurityExportOptions["sanitization"]): { metadataRemoved: boolean; javascriptRemoved: boolean; attachmentsRemoved: number } {
  const root = pdf.getTrailer?.()?.get?.("Root");
  let metadataRemoved = false;
  let javascriptRemoved = false;
  let attachmentsRemoved = 0;
  if (options.removeMetadata) {
    for (const key of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"]) {
      safeCall(() => pdf.setMetaData(`info:${key}`, ""), undefined);
    }
    deletePath(root, "Metadata");
    metadataRemoved = true;
  }
  if (options.removeJavaScript) {
    const names = safeCall(() => root?.get?.("Names"), null);
    javascriptRemoved = deletePath(names, "JavaScript") || deletePath(root, "JavaScript") || javascriptRemoved;
  }
  if (options.removeOpenActions) {
    javascriptRemoved = deletePath(root, "OpenAction") || deletePath(root, "AA") || javascriptRemoved;
  }
  if (options.removeAttachments) {
    const names = safeCall(() => root?.get?.("Names"), null);
    const before = countNameTreeEntries(root, "EmbeddedFiles");
    if (deletePath(names, "EmbeddedFiles")) attachmentsRemoved += Math.max(1, before);
    if (deletePath(root, "AF")) attachmentsRemoved += 1;
  }
  return { metadataRemoved, javascriptRemoved, attachmentsRemoved };
}

function saveOptions(options: SecurityExportOptions): string {
  const write: Record<string, string | number | boolean> = {
    garbage: options.sanitization.collapseRevisionHistory || options.redaction.enabled ? "deduplicate" : "compact",
    compress: true,
    appearance: "all",
    "regenerate-id": true
  };
  if (options.encryption.mode === "remove") write.encrypt = "none";
  else if (options.encryption.mode === "aes-256") {
    if (!options.encryption.ownerPassword) throw new Error("An owner password is required for AES-256 protection.");
    write.encrypt = "aes-256";
    write["user-password"] = options.encryption.userPassword;
    write["owner-password"] = options.encryption.ownerPassword;
    write.permissions = permissionMask(options.encryption.permissions);
  } else write.encrypt = "keep";
  return JSON.stringify(write);
}

function countSignedFields(pdf: any): number {
  let count = 0;
  for (let pageIndex = 0; pageIndex < pdf.countPages(); pageIndex += 1) {
    const page = pdf.loadPage(pageIndex);
    try {
      for (const widget of safeCall(() => page.getWidgets(), [] as any[])) {
        if (widgetType(widget) !== "signature") continue;
        const signed = typeof widget.isSigned === "function"
          ? safeCall(() => Boolean(widget.isSigned()), false)
          : Boolean(safeCall(() => widget.getObject?.()?.get?.("V"), null));
        if (signed) count += 1;
      }
    } finally { page.destroy(); }
  }
  return count;
}

function applySecurity(document: any, options: SecurityExportOptions): { bytes: Uint8Array; report: Omit<SecurityExportReport, "outputBytes" | "durationMs"> } {
  const pdf = document.asPDF();
  if (!pdf) throw new Error("The document is not a PDF.");
  pdf.disableJS?.();
  const signaturesDetected = countSignedFields(pdf);
  const formFieldsUpdated = applyFormUpdates(pdf, options.formUpdates);
  const redactionsApplied = applyRedactions(pdf, options.redaction);
  const formValuesCleared = options.sanitization.clearFormValues ? clearFormValues(pdf) : 0;
  const pageRemoval = removePageContent(pdf, options.sanitization);
  const catalog = sanitizeCatalog(pdf, options.sanitization);

  if (options.sanitization.flattenAnnotations || options.sanitization.flattenForms) {
    pdf.bake(Boolean(options.sanitization.flattenAnnotations), Boolean(options.sanitization.flattenForms));
  }

  const saveBuffer = pdf.saveToBuffer(saveOptions(options));
  try {
    const bytes = new Uint8Array(saveBuffer.asUint8Array());
    return {
      bytes,
      report: {
        pageCount: pdf.countPages(),
        formFieldsUpdated,
        redactionsApplied,
        signaturesDetected,
        metadataRemoved: catalog.metadataRemoved,
        javascriptRemoved: catalog.javascriptRemoved,
        attachmentsRemoved: catalog.attachmentsRemoved + pageRemoval.attachments,
        linksRemoved: pageRemoval.links,
        commentsRemoved: pageRemoval.comments,
        formValuesCleared,
        formsFlattened: options.sanitization.flattenForms,
        annotationsFlattened: options.sanitization.flattenAnnotations,
        encrypted: options.encryption.mode === "aes-256" || (options.encryption.mode === "keep" && document.needsPassword()),
        warnings: [
          ...(signaturesDetected ? ["Saving or sanitizing a signed document may invalidate existing cryptographic signatures."] : []),
          ...(options.sanitization.removeComments ? ["Comment removal deletes all non-redaction page annotations, including visual editor annotations."] : []),
          ...(options.sanitization.flattenAnnotations ? ["Flattened annotations are no longer editable as annotations."] : []),
          ...(options.sanitization.flattenForms ? ["Flattened form fields are no longer interactive."] : [])
        ]
      }
    };
  } finally { saveBuffer.destroy(); }
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  const startedAt = performance.now();
  try {
    assertActive(request.requestId);
    const source = mupdf.Document.openDocument(request.bytes, "application/pdf");
    try {
      const authentication = authenticate(source, request.password);
      assertActive(request.requestId);
      if (request.type === "INSPECT_SECURITY") {
        const report = inspectDocument(source, authentication);
        self.postMessage({ type: "SECURITY_INSPECTION_RESULT", requestId: request.requestId, report });
      } else {
        const result = applySecurity(source, request.options);
        const output = Uint8Array.from(result.bytes).buffer;
        self.postMessage({
          type: "SECURITY_EXPORT_RESULT",
          requestId: request.requestId,
          output,
          report: { ...result.report, outputBytes: result.bytes.byteLength, durationMs: performance.now() - startedAt }
        }, [output]);
      }
    } finally { source.destroy(); }
  } catch (error) {
    self.postMessage({
      type: "SECURITY_ERROR",
      requestId: request.requestId,
      error: error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError", message: String(error) }
    });
  } finally { cancelled.delete(request.requestId); }
};

export {};

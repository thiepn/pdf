import * as mupdf from "mupdf";
import { analyzeSignatureByteRanges, signatureCoverageLabel } from "../compliance/signatureAnalysis";
import { buildPdfAXmp, parsePdfAClaim } from "../compliance/pdfa";
import type {
  AccessibilityRepair,
  AccessibilitySummary,
  ComplianceExportReport,
  ComplianceFieldDraft,
  ComplianceFieldInfo,
  ComplianceInspection,
  ComplianceOptions,
  ComplianceRect,
  ComplianceSignatureInfo,
  OutputIntentInfo,
  PageBoxInfo,
  PreflightFinding,
  StructureElementInfo
} from "../types/compliance";

type Request =
  | { type: "INSPECT_COMPLIANCE"; requestId: string; bytes: ArrayBuffer; password?: string }
  | { type: "APPLY_COMPLIANCE"; requestId: string; bytes: ArrayBuffer; password?: string; options: ComplianceOptions; srgbProfile?: ArrayBuffer }
  | { type: "CANCEL"; requestId: string };

const cancelled = new Set<string>();
function active(id: string): void { if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError"); }
function safe<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }
function auth(pdf: any, password?: string): void { if (pdf.needsPassword?.() && (!password || pdf.authenticatePassword(password) === 0)) throw new Error("The PDF password is required or incorrect."); }
function documentEncrypted(pdf: any): boolean {
  const description = String(safe(() => pdf.getMetaData?.("encryption") ?? "", "")).trim();
  return Boolean(description && !/^none$/i.test(description)) || Boolean(safe(() => pdf.needsPassword?.(), false));
}
function primitive(value: any): string { return safe(() => String(value?.asString?.() ?? value?.asName?.() ?? value?.valueOf?.() ?? ""), ""); }
function objectId(value: any): string { return safe(() => value?.isIndirect?.() ? `obj-${value.asIndirect()}` : "", ""); }
function resolved(value: any): any { return safe(() => value?.resolve?.() ?? value, value); }
function rect(value: any): ComplianceRect {
  const values = Array.isArray(value) ? value.map(Number) : safe(() => [0, 1, 2, 3].map(index => Number(value?.get?.(index)?.asNumber?.() ?? value?.get?.(index)?.valueOf?.() ?? 0)), [0, 0, 0, 0]);
  const [x0 = 0, y0 = 0, x1 = x0, y1 = y0] = values;
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
function pdfRect(object: any, key: string, inherited = false): ComplianceRect | null {
  const value = inherited ? object?.getInheritable?.(key) : object?.get?.(key);
  return value ? rect(value) : null;
}
function widgetType(widget: any): string {
  if (safe(() => widget.isSignature(), false)) return "signature";
  if (safe(() => widget.isText(), false)) return safe(() => widget.isMultiline(), false) ? "multiline" : "text";
  if (safe(() => widget.isCheckbox(), false)) return "checkbox";
  if (safe(() => widget.isRadioButton(), false)) return "radio";
  if (safe(() => widget.isComboBox(), false)) return "combo";
  if (safe(() => widget.isListBox(), false)) return "list";
  if (safe(() => widget.isButton(), false)) return "button";
  return "unknown";
}
function fieldTooltip(widget: any): string {
  return String(safe(() => widget.getFieldLabel?.(), "") || safe(() => widget.getLabel?.(), "") || "");
}
function bufferBytes(buffer: any): Uint8Array {
  try { return Uint8Array.from(buffer?.asUint8Array?.() ?? buffer ?? []); } finally { buffer?.destroy?.(); }
}

interface ResourceStats { fontIds: Set<string>; fontEmbedded: number; transparency: boolean; overprint: boolean; imageCount: number }
function scanResources(resourcesInput: any, stats: ResourceStats, seen = new Set<string>()): void {
  const resources = resolved(resourcesInput);
  if (!resources) return;
  const rid = objectId(resourcesInput) || objectId(resources);
  if (rid && seen.has(rid)) return;
  if (rid) seen.add(rid);
  const fonts = resources.get?.("Font");
  fonts?.forEach?.((fontRef: any) => {
    const id = objectId(fontRef) || primitive(fontRef);
    if (stats.fontIds.has(id)) return;
    stats.fontIds.add(id);
    const font = resolved(fontRef), descriptor = resolved(font?.get?.("FontDescriptor"));
    if (descriptor && (descriptor.get?.("FontFile") || descriptor.get?.("FontFile2") || descriptor.get?.("FontFile3"))) stats.fontEmbedded += 1;
  });
  const ext = resources.get?.("ExtGState");
  ext?.forEach?.((stateRef: any) => {
    const state = resolved(stateRef);
    const ca = Number(safe(() => state?.get?.("ca")?.asNumber?.() ?? state?.get?.("ca")?.valueOf?.() ?? 1, 1));
    const CA = Number(safe(() => state?.get?.("CA")?.asNumber?.() ?? state?.get?.("CA")?.valueOf?.() ?? 1, 1));
    const blend = primitive(state?.get?.("BM"));
    const smask = primitive(state?.get?.("SMask"));
    if (ca < 0.999 || CA < 0.999 || (blend && blend !== "Normal") || (smask && smask !== "None")) stats.transparency = true;
    if (Boolean(safe(() => state?.get?.("OP")?.asBoolean?.() ?? state?.get?.("OP")?.valueOf?.(), false)) || Boolean(safe(() => state?.get?.("op")?.asBoolean?.() ?? state?.get?.("op")?.valueOf?.(), false))) stats.overprint = true;
  });
  const xObjects = resources.get?.("XObject");
  xObjects?.forEach?.((xRef: any) => {
    const x = resolved(xRef), subtype = primitive(x?.get?.("Subtype"));
    if (subtype === "Image") stats.imageCount += 1;
    if (subtype === "Form") scanResources(x?.get?.("Resources"), stats, seen);
  });
}

function readXmp(root: any): string {
  const metadata = root?.get?.("Metadata");
  if (!metadata) return "";
  return safe(() => new TextDecoder("utf-8").decode(bufferBytes(metadata.readStream())), "");
}
function outputIntents(root: any): OutputIntentInfo[] {
  const array = root?.get?.("OutputIntents"), result: OutputIntentInfo[] = [];
  if (!array?.isArray?.()) return result;
  for (let index = 0; index < Number(array.length ?? 0); index += 1) {
    const intent = resolved(array.get(index)), profile = intent?.get?.("DestOutputProfile"), profileObject = resolved(profile);
    result.push({
      subtype: primitive(intent?.get?.("S")),
      outputConditionIdentifier: primitive(intent?.get?.("OutputConditionIdentifier")),
      info: primitive(intent?.get?.("Info")),
      registryName: primitive(intent?.get?.("RegistryName")),
      components: profileObject ? Number(safe(() => profileObject.get?.("N")?.asNumber?.() ?? profileObject.get?.("N")?.valueOf?.(), NaN)) || null : null,
      embeddedProfile: Boolean(profileObject && safe(() => profileObject.isStream?.(), false))
    });
  }
  return result;
}
function countAttachments(pdf: any): number { return Object.keys(safe(() => pdf.getEmbeddedFiles?.() ?? {}, {})).length; }

function actionType(object: any): string { return primitive(resolved(object)?.get?.("S")); }
function actionIsUnsafe(object: any): boolean {
  const type = actionType(object);
  return ["JavaScript", "Launch", "SubmitForm", "ImportData", "Rendition", "RichMediaExecute"].includes(type);
}
function inspectActions(pdf: any, root: any): { hasJavaScript: boolean; hasUnsafeActions: boolean; hasXfa: boolean } {
  let hasJavaScript = Boolean(root?.get?.("Names")?.get?.("JavaScript")), hasUnsafeActions = false;
  const catalogActions = [root?.get?.("OpenAction"), root?.get?.("AA")];
  for (const action of catalogActions) {
    if (!action) continue;
    if (actionIsUnsafe(action)) hasUnsafeActions = true;
    if (actionType(action) === "JavaScript") hasJavaScript = true;
    resolved(action)?.forEach?.((value: any) => { if (actionIsUnsafe(value)) hasUnsafeActions = true; if (actionType(value) === "JavaScript") hasJavaScript = true; });
  }
  for (let index = 0; index < pdf.countPages(); index += 1) {
    const page = pdf.loadPage(index);
    try {
      const pageObject = page.getObject(), aa = pageObject.get?.("AA");
      aa?.forEach?.((value: any) => { if (actionIsUnsafe(value)) hasUnsafeActions = true; if (actionType(value) === "JavaScript") hasJavaScript = true; });
      for (const annotation of safe(() => page.getAnnotations?.(), [] as any[])) {
        const annotObject = safe(() => annotation.getObject?.(), null);
        for (const value of [annotObject?.get?.("A"), annotObject?.get?.("AA")]) {
          if (actionIsUnsafe(value)) hasUnsafeActions = true;
          if (actionType(value) === "JavaScript") hasJavaScript = true;
          resolved(value)?.forEach?.((nested: any) => { if (actionIsUnsafe(nested)) hasUnsafeActions = true; if (actionType(nested) === "JavaScript") hasJavaScript = true; });
        }
      }
    } finally { page.destroy(); }
  }
  const acroForm = resolved(root?.get?.("AcroForm"));
  return { hasJavaScript, hasUnsafeActions: hasUnsafeActions || hasJavaScript, hasXfa: Boolean(acroForm?.get?.("XFA")) };
}

interface StructureScan { elements: StructureElementInfo[]; contentRefs: number; semanticElements: number }
function scanStructure(pdf: any, root: any): StructureScan {
  const elements: StructureElementInfo[] = [], pageIds = new Map<number, number>();
  for (let pageIndex = 0; pageIndex < pdf.countPages(); pageIndex += 1) {
    const pageObject = pdf.findPage?.(pageIndex);
    const id = safe(() => pageObject?.asIndirect?.(), 0);
    if (id) pageIds.set(id, pageIndex + 1);
  }
  let contentRefs = 0, semanticElements = 0;
  const tree = resolved(root?.get?.("StructTreeRoot"));
  if (!tree) return { elements, contentRefs, semanticElements };
  const walkKid = (kid: any, path: number[], depth: number, topLevelIndex: number): void => {
    if (!kid) return;
    const value = resolved(kid);
    if (safe(() => value?.isNumber?.(), false)) { contentRefs += 1; return; }
    if (value?.isArray?.()) {
      for (let index = 0; index < Number(value.length ?? 0); index += 1) walkKid(value.get(index), [...path, index], depth, topLevelIndex);
      return;
    }
    if (!value?.isDictionary?.()) return;
    const type = primitive(value.get?.("Type")), tag = primitive(value.get?.("S"));
    if (type === "MCR" || value.get?.("MCID")) { contentRefs += 1; return; }
    if (!tag) return;
    semanticElements += 1;
    const pg = value.get?.("Pg"), pgId = safe(() => pg?.asIndirect?.(), 0), children = value.get?.("K");
    const id = objectId(kid) || `path-${path.join(".")}`;
    elements.push({
      id,
      path,
      tag,
      title: primitive(value.get?.("T")),
      altText: primitive(value.get?.("Alt")),
      language: primitive(value.get?.("Lang")),
      pageNumber: pgId ? pageIds.get(pgId) ?? null : null,
      childCount: value?.get?.("K")?.isArray?.() ? Number(value.get("K").length ?? 0) : value?.get?.("K") ? 1 : 0,
      depth,
      topLevelIndex
    });
    if (children) walkKid(children, [...path, 0], depth + 1, topLevelIndex);
  };
  const kids = tree.get?.("K");
  if (kids?.isArray?.()) for (let index = 0; index < Number(kids.length ?? 0); index += 1) walkKid(kids.get(index), [index], 0, index);
  else if (kids) walkKid(kids, [0], 0, 0);
  return { elements, contentRefs, semanticElements };
}
function accessibilitySummary(root: any, metadata: Record<string, string>, fields: ComplianceFieldInfo[], structure: StructureScan): AccessibilitySummary {
  const tagged = Boolean(root?.get?.("StructTreeRoot")), language = primitive(root?.get?.("Lang"));
  const figures = structure.elements.filter(item => item.tag === "Figure"), headings = structure.elements.filter(item => /^H[1-6]$/.test(item.tag)), tables = structure.elements.filter(item => item.tag === "Table");
  const topLevelElementCount = structure.elements.filter(item => item.depth === 0).length;
  const quality = !tagged ? "missing" : structure.elements.length === 0 ? "baseline" : structure.contentRefs > 0 ? "meaningful" : "partial";
  const readingOrderStatus = !tagged ? "missing" : structure.elements.length === 0 ? "baseline" : structure.contentRefs > 0 ? "present" : "partial";
  return {
    tagged,
    language,
    title: metadata.Title ?? "",
    structureRoot: tagged,
    structureQuality: quality,
    structureElementCount: structure.elements.length,
    topLevelElementCount,
    figuresWithoutAltText: figures.filter(item => !item.altText.trim()).length,
    formFieldsWithoutTooltips: fields.filter(field => !field.tooltip.trim()).length,
    readingOrderStatus,
    headingCount: headings.length,
    tableCount: tables.length
  };
}

function findings(input: ComplianceInspection): PreflightFinding[] {
  const result: PreflightFinding[] = [];
  result.push({ id: "archive-encryption", profile: "archival", severity: input.encrypted ? "error" : "pass", title: "Archival encryption", detail: input.encrypted ? "PDF/A forbids encryption. Archival export must be saved unencrypted." : "The PDF is not encrypted.", repairable: input.encrypted });
  result.push({ id: "archive-fonts", profile: "archival", severity: input.fontTotal === input.fontEmbedded ? "pass" : "error", title: "Embedded fonts", detail: `${input.fontEmbedded} of ${input.fontTotal} recursively detected fonts are embedded.`, repairable: false });
  result.push({ id: "archive-active", profile: "archival", severity: input.hasUnsafeActions ? "error" : "pass", title: "Active content", detail: input.hasUnsafeActions ? "JavaScript or another unsafe automatic action is present." : "No unsafe catalog/page/annotation action was detected.", repairable: true });
  result.push({ id: "archive-output-intent", profile: "archival", severity: input.outputIntents.some(item => item.embeddedProfile) ? "pass" : "error", title: "Output intent", detail: input.outputIntents.some(item => item.embeddedProfile) ? `${input.outputIntents.length} output intent(s) detected with an embedded profile.` : "No embedded output-intent ICC profile was detected.", repairable: true });
  result.push({ id: "archive-xmp", profile: "archival", severity: input.pdfaClaim.claimed ? "pass" : "warning", title: "PDF/A identification metadata", detail: input.pdfaClaim.claimed ? `The XMP packet claims ${input.pdfaClaim.profile}. This is a claim, not validator proof.` : "No PDF/A identification schema was found in XMP metadata.", repairable: true });
  result.push({ id: "archive-attachments", profile: "archival", severity: input.attachmentCount ? "warning" : "pass", title: "Embedded files", detail: input.attachmentCount ? `${input.attachmentCount} embedded file(s) require profile-specific PDF/A review.` : "No embedded files were detected.", repairable: false });

  const aq = input.accessibility.structureQuality;
  result.push({ id: "access-tags", profile: "accessibility", severity: aq === "meaningful" ? "pass" : aq === "missing" ? "error" : "warning", title: "Tagged structure quality", detail: aq === "meaningful" ? `${input.accessibility.structureElementCount} semantic structure elements include page-content references.` : aq === "baseline" ? "A StructTreeRoot exists but contains no semantic elements." : aq === "partial" ? "Semantic structure elements exist, but no marked-content references were confirmed." : "No structure tree is present.", repairable: aq !== "meaningful" });
  result.push({ id: "access-lang", profile: "accessibility", severity: input.accessibility.language ? "pass" : "error", title: "Document language", detail: input.accessibility.language || "The document language is missing.", repairable: true });
  result.push({ id: "access-title", profile: "accessibility", severity: input.accessibility.title ? "pass" : "warning", title: "Document title", detail: input.accessibility.title || "The title metadata is missing.", repairable: true });
  result.push({ id: "access-alt", profile: "accessibility", severity: input.accessibility.figuresWithoutAltText ? "warning" : "pass", title: "Figure alternative text", detail: input.accessibility.figuresWithoutAltText ? `${input.accessibility.figuresWithoutAltText} tagged Figure element(s) have no Alt text.` : "No missing Alt text was found on tagged Figure elements.", repairable: true });
  result.push({ id: "access-fields", profile: "accessibility", severity: input.accessibility.formFieldsWithoutTooltips ? "warning" : "pass", title: "Form tooltips", detail: input.accessibility.formFieldsWithoutTooltips ? `${input.accessibility.formFieldsWithoutTooltips} form field(s) have no tooltip/alternate field name.` : "All detected form fields expose tooltips.", repairable: true });

  const missingTrim = input.pages.filter(page => !page.trimBox).length, missingBleed = input.pages.filter(page => !page.bleedBox).length;
  const transparent = input.pages.filter(page => page.transparency).length, overprint = input.pages.filter(page => page.overprint).length;
  result.push({ id: "print-boxes", profile: "print", severity: missingTrim || missingBleed ? "warning" : "pass", title: "Trim and bleed boxes", detail: `${missingTrim} page(s) lack TrimBox; ${missingBleed} page(s) lack BleedBox.`, repairable: true });
  result.push({ id: "print-transparency", profile: "print", severity: transparent ? "info" : "pass", title: "Transparency", detail: transparent ? `${transparent} page(s) reference transparency or non-normal blend state.` : "No transparency state was detected in recursively scanned page resources.", repairable: false });
  result.push({ id: "print-overprint", profile: "print", severity: overprint ? "info" : "pass", title: "Overprint", detail: overprint ? `${overprint} page(s) reference overprint state.` : "No overprint state was detected in recursively scanned page resources.", repairable: false });
  result.push({ id: "print-intent", profile: "print", severity: input.outputIntents.length ? "pass" : "warning", title: "Output intent", detail: input.outputIntents.length ? `${input.outputIntents.length} output intent(s) detected.` : "No output intent is present; print color interpretation may be device-dependent.", repairable: true });

  result.push({ id: "security-actions", profile: "security", severity: input.hasUnsafeActions ? "error" : "pass", title: "Unsafe actions", detail: input.hasUnsafeActions ? "JavaScript, Launch, SubmitForm, ImportData, Rendition, or RichMedia action was detected." : "No known unsafe action type was detected.", repairable: true });
  result.push({ id: "security-xfa", profile: "security", severity: input.hasXfa ? "warning" : "pass", title: "XFA forms", detail: input.hasXfa ? "An XFA form package is present and requires specialist review." : "No XFA package was detected.", repairable: false });
  result.push({ id: "security-attachments", profile: "security", severity: input.attachmentCount ? "warning" : "pass", title: "Embedded attachments", detail: input.attachmentCount ? `${input.attachmentCount} embedded file(s) require review.` : "No embedded files were detected.", repairable: true });

  const badRanges = input.signatures.filter(item => item.status === "invalid-range").length, oldRanges = input.signatures.filter(item => item.status === "covers-prior-revision").length;
  result.push({ id: "signature-ranges", profile: "signatures", severity: badRanges ? "error" : oldRanges ? "warning" : "pass", title: "Signature byte coverage", detail: badRanges ? `${badRanges} signature(s) have invalid ByteRange values.` : oldRanges ? `${oldRanges} signature(s) cover an earlier revision but not all current file bytes.` : input.signatures.length ? "No invalid or stale ByteRange coverage was detected." : "No signature fields were detected.", repairable: false });
  return result;
}

function inspect(pdf: any, requestId: string, sourceBytes: Uint8Array): ComplianceInspection {
  const trailer = pdf.getTrailer?.(), root = resolved(trailer?.get?.("Root")), fields: ComplianceFieldInfo[] = [], signatures: ComplianceSignatureInfo[] = [];
  const byteRanges = analyzeSignatureByteRanges(sourceBytes); let signedIndex = 0;
  const pages: PageBoxInfo[] = []; const globalResources: ResourceStats = { fontIds: new Set(), fontEmbedded: 0, transparency: false, overprint: false, imageCount: 0 };
  for (let index = 0; index < pdf.countPages(); index += 1) {
    active(requestId); const page = pdf.loadPage(index);
    try {
      const pageObject = page.getObject(), pageStats: ResourceStats = { fontIds: globalResources.fontIds, fontEmbedded: globalResources.fontEmbedded, transparency: false, overprint: false, imageCount: 0 };
      scanResources(pageObject.getInheritable?.("Resources"), pageStats);
      globalResources.fontEmbedded = pageStats.fontEmbedded; globalResources.transparency ||= pageStats.transparency; globalResources.overprint ||= pageStats.overprint; globalResources.imageCount += pageStats.imageCount;
      const group = resolved(pageObject.get?.("Group")); if (primitive(group?.get?.("S")) === "Transparency") pageStats.transparency = true;
      const annotations = safe(() => page.getAnnotations?.(), [] as any[]);
      pages.push({ pageNumber: index + 1, mediaBox: pdfRect(pageObject, "MediaBox", true) ?? rect(page.getBounds()), cropBox: pdfRect(pageObject, "CropBox", true) ?? pdfRect(pageObject, "MediaBox", true) ?? rect(page.getBounds()), trimBox: pdfRect(pageObject, "TrimBox"), bleedBox: pdfRect(pageObject, "BleedBox"), artBox: pdfRect(pageObject, "ArtBox"), rotation: Number(safe(() => pageObject.getInheritable?.("Rotate")?.asNumber?.() ?? pageObject.getInheritable?.("Rotate")?.valueOf?.() ?? 0, 0)), transparency: pageStats.transparency, overprint: pageStats.overprint, annotationCount: annotations.length });
      for (const widget of safe(() => page.getWidgets(), [] as any[])) {
        const type = widgetType(widget), name = String(safe(() => widget.getName(), "")), tooltip = fieldTooltip(widget), value = String(safe(() => widget.getValue(), "")), signed = type === "signature" && Boolean(value || safe(() => widget.isSigned?.(), false));
        fields.push({ pageNumber: index + 1, name, tooltip, type, value, required: Boolean(safe(() => widget.isRequired(), false)), readOnly: Boolean(safe(() => widget.isReadOnly(), false)), signed, bounds: rect(safe(() => widget.getRect(), [0, 0, 0, 0])) });
        if (type === "signature") {
          const coverage = signed ? byteRanges[signedIndex++] ?? { byteRange: null, status: "structural-only" as const, coveredBytes: 0, unsignedTailBytes: sourceBytes.byteLength, signatureGapBytes: 0, filter: "", subFilter: "", signingTime: "", reason: "", location: "" } : { byteRange: null, status: "unsigned" as const, coveredBytes: 0, unsignedTailBytes: sourceBytes.byteLength, signatureGapBytes: 0, filter: "", subFilter: "", signingTime: "", reason: "", location: "" };
          signatures.push({ pageNumber: index + 1, name: name || `Signature ${signatures.length + 1}`, signed, ...coverage, reasonSummary: signed ? signatureCoverageLabel(coverage) : "The signature field is empty." });
        }
      }
    } finally { page.destroy(); }
  }
  const metadata: Record<string, string> = {};
  for (const key of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"]) { const value = String(safe(() => pdf.getMetaData(`info:${key}`), "")); if (value) metadata[key] = value; }
  const structure = scanStructure(pdf, root), accessibility = accessibilitySummary(root, metadata, fields, structure), xmp = readXmp(root), actions = inspectActions(pdf, root);
  const inspection: ComplianceInspection = {
    pageCount: pdf.countPages(), pdfVersion: String(safe(() => pdf.getMetaData("format"), `PDF ${Number(safe(() => pdf.getVersion?.(), 0)) / 10}`)), encrypted: documentEncrypted(pdf), fields, signatures, accessibility, structureElements: structure.elements, findings: [], pages, outputIntents: outputIntents(root), pdfaClaim: parsePdfAClaim(xmp), fontTotal: globalResources.fontIds.size, fontEmbedded: globalResources.fontEmbedded, hasJavaScript: actions.hasJavaScript, hasUnsafeActions: actions.hasUnsafeActions, hasXfa: actions.hasXfa, attachmentCount: countAttachments(pdf), layerCount: Number(safe(() => pdf.countLayers?.(), 0)), metadata, versionCount: Number(safe(() => pdf.countVersions?.(), 1)), changeHistoryStatus: String(safe(() => pdf.validateChangeHistory?.() ?? "not-reported", "not-reported")), warnings: []
  };
  inspection.findings = findings(inspection); return inspection;
}

function fieldType(type: string): string { return ({ text: "Text", multiline: "Text", password: "Text", checkbox: "CheckBox", radio: "RadioButton", combo: "ComboBox", list: "ListBox", button: "Button", signature: "Signature" } as Record<string, string>)[type] ?? "Text"; }
function addField(page: any, draft: ComplianceFieldDraft): void {
  if (typeof page.createWidget !== "function") throw new Error("This MuPDF browser build does not expose form-field creation.");
  const widget = page.createWidget(fieldType(draft.type), draft.name);
  widget.setRect([draft.bounds.x, draft.bounds.y, draft.bounds.x + draft.bounds.w, draft.bounds.y + draft.bounds.h]);
  widget.setFieldFlags?.((draft.required ? 2 : 0) | (draft.readOnly ? 1 : 0) | (draft.type === "multiline" ? 4096 : 0) | (draft.type === "password" ? 8192 : 0));
  widget.setFieldLabel?.(draft.tooltip || draft.name);
  if (draft.options.length && typeof widget.setOptions === "function") widget.setOptions(draft.options);
  if (draft.defaultValue) { if (["text", "multiline", "password"].includes(draft.type)) widget.setTextValue?.(draft.defaultValue); else if (["combo", "list"].includes(draft.type)) widget.setChoiceValue?.(draft.defaultValue); }
  widget.update?.();
}
function removeUnsafeActions(pdf: any): boolean {
  const root = resolved(pdf.getTrailer?.()?.get?.("Root")); let changed = false;
  for (const key of ["OpenAction", "AA"]) if (root?.get?.(key)) { root.delete(key); changed = true; }
  const names = resolved(root?.get?.("Names")); if (names?.get?.("JavaScript")) { names.delete("JavaScript"); changed = true; }
  for (let index = 0; index < pdf.countPages(); index += 1) {
    const page = pdf.loadPage(index); try {
      const pageObject = page.getObject(); if (pageObject.get?.("AA")) { pageObject.delete("AA"); changed = true; }
      for (const annotation of safe(() => page.getAnnotations?.(), [] as any[])) {
        const object = safe(() => annotation.getObject?.(), null);
        if (object?.get?.("AA")) { object.delete("AA"); changed = true; }
        if (actionIsUnsafe(object?.get?.("A"))) { object.delete("A"); changed = true; }
      }
    } finally { page.destroy(); }
  }
  pdf.disableJS?.(); return changed;
}
function baselineTags(pdf: any, language: string, title: string): boolean {
  const root = resolved(pdf.getTrailer?.()?.get?.("Root")); if (!root) return false;
  if (language) root.put("Lang", pdf.newString(language));
  let markInfo = resolved(root.get("MarkInfo")); if (!markInfo) { markInfo = pdf.newDictionary(); root.put("MarkInfo", markInfo); }
  markInfo.put("Marked", pdf.newBoolean(true));
  if (!root.get("StructTreeRoot")) { const tree = pdf.newDictionary(); tree.put("Type", pdf.newName("StructTreeRoot")); tree.put("K", pdf.newArray()); const parentTree = pdf.newDictionary(); parentTree.put("Nums", pdf.newArray()); tree.put("ParentTree", parentTree); root.put("StructTreeRoot", pdf.addObject(tree)); }
  if (title) pdf.setMetaData?.("info:Title", title); return true;
}
function embedOutputIntent(pdf: any, profileBytes: Uint8Array): boolean {
  if (!profileBytes.byteLength) return false;
  const root = resolved(pdf.getTrailer?.()?.get?.("Root")); if (!root) return false;
  const profileDict = pdf.newDictionary(); profileDict.put("N", pdf.newInteger(3)); profileDict.put("Alternate", pdf.newName("DeviceRGB"));
  const profile = pdf.addStream(profileBytes, profileDict), intent = pdf.newDictionary();
  intent.put("Type", pdf.newName("OutputIntent")); intent.put("S", pdf.newName("GTS_PDFA1")); intent.put("OutputConditionIdentifier", pdf.newString("sRGB IEC61966-2.1")); intent.put("RegistryName", pdf.newString("http://www.color.org")); intent.put("Info", pdf.newString("Artifex Software sRGB ICC Profile")); intent.put("DestOutputProfile", profile);
  const array = pdf.newArray(); array.push(pdf.addObject(intent)); root.put("OutputIntents", array); return true;
}
function writeXmp(pdf: any, options: ComplianceOptions): boolean {
  if (options.archivalLevel === "none") return false; const root = resolved(pdf.getTrailer?.()?.get?.("Root")); if (!root) return false;
  const packet = buildPdfAXmp(options.archivalLevel, options.setTitle, options.setLanguage), dict = pdf.newDictionary(); dict.put("Type", pdf.newName("Metadata")); dict.put("Subtype", pdf.newName("XML"));
  root.put("Metadata", pdf.addStream(new TextEncoder().encode(packet), dict)); return true;
}
function findStructElement(root: any, id: string): any {
  const tree = resolved(root?.get?.("StructTreeRoot")), kids = tree?.get?.("K"); let found: any = null;
  const walk = (kid: any, path: number[]): void => {
    if (!kid || found) return;
    const value = resolved(kid);
    if (value?.isArray?.()) { for (let index = 0; index < Number(value.length ?? 0); index += 1) walk(value.get(index), [...path, index]); return; }
    if (!value?.isDictionary?.()) return;
    const candidate = objectId(kid) || `path-${path.join(".")}`;
    if (candidate === id) { found = value; return; }
    const type = primitive(value.get?.("Type")); if (type === "MCR" || value.get?.("MCID")) return;
    const child = value.get?.("K"); if (child) walk(child, [...path, 0]);
  };
  if (kids?.isArray?.()) for (let index = 0; index < Number(kids.length ?? 0); index += 1) walk(kids.get(index), [index]);
  else if (kids) walk(kids, [0]);
  return found;
}
function applyAccessibilityRepairs(pdf: any, repairs: AccessibilityRepair[]): number {
  const root = resolved(pdf.getTrailer?.()?.get?.("Root")); let count = 0;
  for (const repair of repairs) { const element = findStructElement(root, repair.elementId); if (!element) continue; if (repair.altText !== undefined) element.put("Alt", pdf.newString(repair.altText)); if (repair.language !== undefined) element.put("Lang", pdf.newString(repair.language)); count += 1; }
  return count;
}
function reorderTopLevelStructure(pdf: any, orderedIds: string[]): boolean {
  if (!orderedIds.length) return false; const root = resolved(pdf.getTrailer?.()?.get?.("Root")), tree = resolved(root?.get?.("StructTreeRoot")), kids = tree?.get?.("K"); if (!kids?.isArray?.()) return false;
  const original: any[] = []; for (let index = 0; index < Number(kids.length ?? 0); index += 1) original.push(kids.get(index));
  const map = new Map(original.map((item, index) => [objectId(item) || `path-${index}`, item]) as Array<[string, any]>), reordered: any[] = [];
  for (const id of orderedIds) { const item = map.get(id); if (item) { reordered.push(item); map.delete(id); } }
  for (const item of original) if (!reordered.includes(item)) reordered.push(item);
  const next = pdf.newArray(); for (const item of reordered) next.push(item); tree.put("K", next); return true;
}
function repairFormTooltips(pdf: any): number {
  let repaired = 0; for (let index = 0; index < pdf.countPages(); index += 1) { const page = pdf.loadPage(index); try { for (const widget of safe(() => page.getWidgets(), [] as any[])) { const name = String(safe(() => widget.getName(), "")); if (name && !fieldTooltip(widget)) { widget.setFieldLabel?.(name); widget.update?.(); repaired += 1; } } } finally { page.destroy(); } } return repaired;
}
function applyDocumentIdentity(pdf: any, language: string, title: string): void {
  if (language) safe(() => pdf.setLanguage?.(language), undefined);
  if (title) safe(() => pdf.setMetaData?.("info:Title", title), undefined);
}
function prepareArchival(pdf: any, options: ComplianceOptions, srgbProfile?: ArrayBuffer): { outputIntentEmbedded: boolean; xmpNormalized: boolean } {
  pdf.disableJS?.(); if (options.removeActiveContent) removeUnsafeActions(pdf); safe(() => pdf.subsetFonts(), undefined); applyDocumentIdentity(pdf, options.setLanguage, options.setTitle);
  return { outputIntentEmbedded: options.addOutputIntent && srgbProfile ? embedOutputIntent(pdf, new Uint8Array(srgbProfile)) : false, xmpNormalized: options.normalizeXmp ? writeXmp(pdf, options) : false };
}
function save(pdf: any, archival: boolean): Uint8Array {
  const options = `garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=${archival ? "none" : "keep"}`;
  const buffer = pdf.saveToBuffer(options); try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data; if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  void (async () => {
    let pdf: any; const startedAt = performance.now();
    try {
      const sourceBytes = new Uint8Array(request.bytes); pdf = new (mupdf as any).PDFDocument(sourceBytes); auth(pdf, request.password); const sourceEncrypted = documentEncrypted(pdf); safe(() => pdf.checkSyntax(), 0);
      if (request.type === "INSPECT_COMPLIANCE") { self.postMessage({ type: "COMPLIANCE_INSPECTION", requestId: request.requestId, inspection: inspect(pdf, request.requestId, sourceBytes) }); return; }
      const options = request.options; let created = 0, signatureFields = 0;
      for (const draft of options.fields) { active(request.requestId); if (draft.pageNumber < 1 || draft.pageNumber > pdf.countPages()) continue; const page = pdf.loadPage(draft.pageNumber - 1); try { addField(page, draft); created += 1; if (draft.type === "signature") signatureFields += 1; } finally { page.destroy(); } }
      let activeContentRemoved = false, baselineTagged = false, archivalPrepared = false, outputIntentEmbedded = false, xmpNormalized = false;
      if (options.removeActiveContent) activeContentRemoved = removeUnsafeActions(pdf);
      if (options.createBaselineTags) baselineTagged = baselineTags(pdf, options.setLanguage, options.setTitle);
      const accessibilityRepairsApplied = applyAccessibilityRepairs(pdf, options.accessibilityRepairs ?? []), readingOrderChanged = reorderTopLevelStructure(pdf, options.topLevelReadingOrder ?? []), formTooltipsRepaired = options.repairMissingFormTooltips ? repairFormTooltips(pdf) : 0;
      if (options.prepareArchival && options.archivalLevel !== "none") { archivalPrepared = true; const archival = prepareArchival(pdf, options, request.srgbProfile); outputIntentEmbedded = archival.outputIntentEmbedded; xmpNormalized = archival.xmpNormalized; }
      if (options.flattenForms) pdf.bake?.(false, true);
      const archivalSave = options.prepareArchival && options.archivalLevel !== "none", output = save(pdf, archivalSave), reopened = new (mupdf as any).PDFDocument(output);
      try {
        auth(reopened, archivalSave ? undefined : request.password);
        const after = inspect(reopened, request.requestId, output); if (after.pageCount !== pdf.countPages()) throw new Error("Compliance validation failed: page count changed.");
        if (created && !options.flattenForms && after.fields.length < created) throw new Error("Created form fields did not persist.");
        if (options.createBaselineTags && !after.accessibility.tagged) throw new Error("Tagged structure root did not persist.");
        if (options.setLanguage && !after.accessibility.language) throw new Error("Document language did not persist.");
        if (archivalSave && after.encrypted) throw new Error("Archival export remained encrypted after save.");
        if (outputIntentEmbedded && !after.outputIntents.some(item => item.embeddedProfile)) throw new Error("Embedded output intent did not persist.");
        if (xmpNormalized && !after.pdfaClaim.claimed) throw new Error("PDF/A identification XMP did not persist.");
        const warnings = [
          ...(archivalSave ? [`${options.archivalLevel} metadata, output intent, decryption, active-content cleanup, and font subsetting are preparation steps; formal PDF/A conformance still requires an independent validator.`] : []),
          ...(baselineTagged && after.accessibility.structureQuality === "baseline" ? ["The generated StructTreeRoot is only a baseline container. It does not make untagged page content accessible."] : []),
          ...(readingOrderChanged ? ["Top-level structure order was changed. Verify the result with assistive technology and a PDF/UA validator."] : []),
          ...(after.signatures.some(item => item.signed) ? ["Rewriting a signed PDF can invalidate prior signatures even if their original ByteRange remains parseable."] : [])
        ];
        const report: ComplianceExportReport = { operation: "compliance-export", pageCount: after.pageCount, outputBytes: output.byteLength, fieldsCreated: created, signatureFieldsCreated: signatureFields, activeContentRemoved, baselineTagged, archivalPrepared, archivalProfile: options.archivalLevel, outputIntentEmbedded, xmpNormalized, encryptionRemoved: sourceEncrypted && archivalSave && !after.encrypted, accessibilityRepairsApplied, formTooltipsRepaired, findings: after.findings, warnings, durationMs: performance.now() - startedAt };
        const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength); self.postMessage({ type: "COMPLIANCE_RESULT", requestId: request.requestId, output: buffer, report }, [buffer]);
      } finally { reopened.destroy?.(); }
    } catch (error) { self.postMessage({ type: "COMPLIANCE_ERROR", requestId: request.requestId, error: { message: error instanceof Error ? error.message : String(error) } }); }
    finally { pdf?.destroy?.(); cancelled.delete(request.requestId); }
  })();
};

export {};

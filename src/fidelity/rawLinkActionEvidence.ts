/**
 * P8 supplemental PDF link-action evidence.
 *
 * MuPDF parses actual PDF dictionaries. No PDF source byte scanning and no
 * action/script execution occurs here. The PDF.js-visible primary link
 * destination is checked separately by P8; this narrowly closes /Next and
 * annotation /AA omissions in that public representation.
 */
export interface RawLinkActionPage {
  fingerprints: string[];
  hasJavaScript: boolean;
  hasAdditionalActions: boolean;
  /** The PDF.js visible annotation list omits /Popup ownership edges. */
  popupRelationships: string[];
  popupInvalid: boolean;
}
export type RawLinkActionEvidence = Record<number, RawLinkActionPage>;
export interface RawLinkActionNormalization {
  removeJavaScript?: boolean;
  removeAdditionalActions?: boolean;
}

const MAX_NODES = 4096;
const MAX_DEPTH = 24;
const MAX_ITEMS = 1024;
const MAX_STRING_LENGTH = 16384;

function present(value: any): boolean {
  return value != null && !(typeof value.isNull === "function" && value.isNull());
}

function canonical(
  value: any,
  pageRefs: () => Map<number, number>,
  budget: { remaining: number },
  visited: Set<number>,
  normalization: RawLinkActionNormalization,
  detection: { hasJavaScript: boolean },
  depth = 0
): unknown {
  if (!present(value)) return null;
  if (--budget.remaining < 0 || depth > MAX_DEPTH) throw new Error("The PDF link action graph exceeds safe inspection limits.");
  if (value.isIndirect?.()) {
    const reference = value.asIndirect();
    const page = pageRefs().get(reference);
    if (page !== undefined) return ["page", page];
    if (visited.has(reference)) throw new Error("The PDF link action graph has a circular reference.");
    const next = new Set(visited);
    next.add(reference);
    return canonical(value.resolve(), pageRefs, budget, next, normalization, detection, depth + 1);
  }
  if (value.isStream?.()) throw new Error("Stream-valued link actions require explicit qualification.");
  if (value.isDictionary?.()) {
    const values: Array<[string, any]> = [];
    value.forEach((child: any, key: string) => {
      if (values.length >= MAX_ITEMS) throw new Error("The PDF link action dictionary is too large.");
      values.push([String(key), child]);
    });
    const javaScript = values.some(([key, child]) => key === "S" && child?.asName?.() === "JavaScript")
      || values.some(([key]) => key === "JS");
    if (javaScript) detection.hasJavaScript = true;
    values.sort((a,b) => a[0].localeCompare(b[0]));
    return ["dict", values
      .filter(([key]) => !(javaScript && normalization.removeJavaScript && (key === "S" || key === "JS")))
      .map(([key, child]) => [key, canonical(child, pageRefs, budget, visited, normalization, detection, depth + 1)])];
  }
  if (value.isArray?.()) {
    if (value.length > MAX_ITEMS) throw new Error("The PDF link action array is too large.");
    return ["array", Array.from({ length: value.length }, (_, index) =>
      canonical(value.get(index), pageRefs, budget, visited, normalization, detection, depth + 1))];
  }
  if (value.isName?.()) return ["name", value.asName()];
  if (value.isString?.()) {
    const str = value.asString();
    if (str.length > MAX_STRING_LENGTH) throw new Error("The PDF link action string is too large.");
    return ["string", str];
  }
  const primitive = value.asJS?.();
  if (typeof primitive === "number" && Number.isFinite(primitive)) return ["number", primitive];
  if (typeof primitive === "boolean") return ["boolean", primitive];
  throw new Error("An unsupported PDF link action value prevents fidelity certification.");
}

function rectKey(annotation: any): number[] {
  const rect = annotation.get("Rect");
  if (!present(rect) || !rect.isArray?.() || rect.length !== 4) {
    throw new Error("The PDF link action rectangle cannot be verified.");
  }
  return Array.from({ length: 4 }, (_, index) => {
    const value = rect.get(index).asNumber();
    if (!Number.isFinite(value)) throw new Error("The PDF link action rectangle is invalid.");
    return Math.round(value * 100) / 100;
  });
}

/** Compare popup ownership by visible parent and popup properties, not indirect
 * object numbers. Rebuilt PDFs can legitimately renumber both objects. */
function popupOwnership(annotations: any): { relationships: string[]; invalid: boolean } {
  if (!present(annotations)) return { relationships: [], invalid: false };
  if (!annotations.isArray?.() || annotations.length > MAX_ITEMS) {
    throw new Error("The PDF annotation ownership graph exceeds safe inspection limits.");
  }
  const entries: any[] = Array.from({ length: annotations.length }, (_, i) => annotations.get(i));
  const byRef = new Map<number, any>();
  for (const entry of entries) {
    if (entry.isIndirect?.()) byRef.set(entry.asIndirect(), entry);
  }
  const ref = (value: any): number | null =>
    present(value) && value.isIndirect?.() ? value.asIndirect() : null;
  const kind = (value: any): string => value.get("Subtype").asName?.() ?? "";
  const key = (entry: any): string => {
    const rect = entry.get("Rect");
    const coordinates = present(rect) && rect.isArray?.() && rect.length === 4
      ? Array.from({ length: 4 }, (_, i) => {
          const coordinate = rect.get(i).asNumber();
          if (!Number.isFinite(coordinate)) throw new Error("Invalid PDF popup geometry.");
          return Math.round(coordinate * 100) / 100;
        })
      : [];
    const field = (name: string): unknown => {
      const value = entry.get(name);
      const result = present(value) ? value.asJS?.() : null;
      if (typeof result === "string" && result.length > MAX_STRING_LENGTH) {
        throw new Error("PDF popup metadata exceeds safe inspection limits.");
      }
      return result ?? null;
    };
    return JSON.stringify([kind(entry), coordinates, field("Contents"), field("T"),
      field("NM"), field("F"), field("Open")]);
  };
  let invalid = false;
  const relationships: string[] = [];
  for (const entry of entries) {
    const subtype = kind(entry);
    const parent = entry.get("Parent");
    const popup = entry.get("Popup");
    if (subtype === "Popup") {
      const owner = byRef.get(ref(parent) ?? -1);
      if (!owner || kind(owner) === "Popup" || kind(owner) === "Widget"
          || ref(owner.get("Popup")) !== ref(entry)) invalid = true;
    } else if (present(popup)) {
      const child = byRef.get(ref(popup) ?? -1);
      if (!child || kind(child) !== "Popup" || ref(child.get("Parent")) !== ref(entry)) {
        invalid = true;
      } else {
        relationships.push(JSON.stringify([key(entry), key(child)]));
      }
    }
  }
  return { relationships: relationships.sort(), invalid };
}

export function inspectRawLinkActionEvidence(
  pdf: any,
  pages: number[],
  normalization: RawLinkActionNormalization = {}
): RawLinkActionEvidence {
  const count = pdf.countPages();
  const result: RawLinkActionEvidence = {};
  let pageRefs: Map<number, number> | undefined;
  const getPageRefs = () => {
    if (!pageRefs) {
      pageRefs = new Map();
      for (let i = 0; i < count; i += 1) {
        const page = pdf.loadPage(i);
        try {
          const reference = page.getObject().asIndirect();
          if (Number.isInteger(reference)) pageRefs.set(reference, i + 1);
        } finally { page.destroy(); }
      }
    }
    return pageRefs;
  };

  for (const pageNumber of [...new Set(pages)]) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > count) throw new Error("Invalid P8 raw-action page number.");
    const fingerprints: string[] = [];
    const detection = { hasJavaScript: false };
    let hasAdditionalActions = false;
    const page = pdf.loadPage(pageNumber - 1);
    let popup: { relationships: string[]; invalid: boolean };
    try {
      const annotations = page.getObject().get("Annots");
      popup = popupOwnership(annotations);
      if (present(annotations) && !annotations.isArray?.()) throw new Error("PDF annotations must be an array.");
      for (let index = 0; present(annotations) && index < annotations.length; index += 1) {
        if (index >= MAX_ITEMS) throw new Error("Too many PDF annotations for raw-action inspection.");
        const annotation = annotations.get(index);
        if (!annotation.isDictionary?.() || annotation.get("Subtype").asName?.() !== "Link") continue;
        const primary = annotation.get("A");
        const next = present(primary) ? primary.get("Next") : null;
        const additional = annotation.get("AA");
        if (present(additional)) hasAdditionalActions = true;
        if (!present(next) && (normalization.removeAdditionalActions || !present(additional))) continue;
        const budget = { remaining: MAX_NODES };
        fingerprints.push(JSON.stringify([
          rectKey(annotation),
          canonical(next, getPageRefs, budget, new Set(), normalization, detection),
          normalization.removeAdditionalActions ? null :
            canonical(additional, getPageRefs, budget, new Set(), normalization, detection)
        ]));
      }
    } finally { page.destroy(); }
    result[pageNumber] = {
      fingerprints: fingerprints.sort(),
      hasJavaScript: detection.hasJavaScript,
      hasAdditionalActions,
      popupRelationships: popup.relationships,
      popupInvalid: popup.invalid
    };
  }
  return result;
}

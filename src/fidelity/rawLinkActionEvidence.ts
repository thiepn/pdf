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
    try {
      const annotations = page.getObject().get("Annots");
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
      hasAdditionalActions
    };
  }
  return result;
}

import * as mupdf from "mupdf";

type PDF = InstanceType<typeof mupdf.PDFDocument>;
type Obj = ReturnType<PDF["newDictionary"]>;
type Graft = ReturnType<PDF["newGraftMap"]>;
export interface CopiedPage { sourceIndex: number; sourcePageIndex: number; outputPageIndex: number }

/** graftPage copies resources and drawing commands, NOT annotations or forms.
 * Rebuild these explicitly without importing source page trees through /P, /Parent,
 * /Dest, /Popup or reply links. Unselected pages must not leak into an extraction.
 */
const ANNOTATION_KEYS = new Set(("MK H Type Subtype Rect Contents NM M F AP AS Border BS BE C CA ca BM Open Name T Subj CreationDate RC DA Q DS CL IT L LE IC LL LLE LLO CP Measure RD QuadPoints Vertices InkList Sy StampName FS").split(" "));
const FIELD_KEYS = ["FT", "Ff", "V", "DV", "Opt", "MaxLen", "Q", "TI", "I"];

function text(object: Obj): string { return object.isString() ? object.asString() : object.isName() ? object.asName() : ""; }
function putString(pdf: PDF, object: Obj, key: string, value: string): void {
  const string = pdf.newString(value); try { object.put(key, string); } finally { string.destroy(); }
}
function fieldChain(widget: Obj): Obj[] {
  const chain: Obj[] = []; const seen = new Set<number>(); let object = widget.resolve();
  for (let depth = 0; depth < 64 && !object.isNull(); depth++) {
    chain.push(object); const parent = object.get("Parent");
    if (parent.isNull() || (parent.isIndirect() && seen.has(parent.asIndirect()))) { parent.destroy(); return chain; }
    if (parent.isIndirect()) seen.add(parent.asIndirect());
    object = parent.resolve(); parent.destroy();
  }
  if (!object.isNull()) object.destroy();
  if (chain.length === 64) { chain.forEach((entry) => entry.destroy()); throw new Error("This PDF has an invalid or excessively deep form-field hierarchy."); }
  return chain;
}
function inherited(chain: Obj[], key: string): Obj | undefined {
  for (const object of chain) { const value = object.get(key); if (!value.isNull()) return value; value.destroy(); }
}

export function preservePageInteractions(destination: PDF, sources: PDF[], maps: Graft[], pages: CopiedPage[]): void {
  const root = destination.getTrailer().get("Root");
  const form = destination.newDictionary(); const fields = destination.newArray(); const resources = destination.newDictionary();
  const fieldCopies = new Map<string, Obj>(); const names = new Set<string>(); const occurrence = new Map<string, number>();
  const defaults = sources.map((pdf) => { const form = pdf.getTrailer().get("Root").get("AcroForm"); if (!form.isNull()) return form; form.destroy(); return pdf.newDictionary(); });
  const originalPageRefs = sources.map((pdf) => new Map<number, number>());
  for (const item of pages) {
    const sourcePage = sources[item.sourceIndex].findPage(item.sourcePageIndex);
    try { originalPageRefs[item.sourceIndex].set(sourcePage.asIndirect(), item.sourcePageIndex); } finally { sourcePage.destroy(); }
  }
  try {
    // Merge default form resources under distinct names. Appearance streams retain
    // their own resource dictionaries; only field default appearances are renamed.
    defaults.forEach((sourceForm, sourceIndex) => {
      const dr = sourceForm.get("DR");
      try {
        if (!dr.isDictionary()) return;
        dr.forEach((category, categoryName) => {
          try {
            if (typeof categoryName !== "string" || !category.isDictionary()) return;
            let target = resources.get(categoryName);
            if (target.isNull()) { target.destroy(); target = destination.newDictionary(); resources.put(categoryName, target); }
            try { category.forEach((value, name) => {
              try {
                const copied = maps[sourceIndex].graftObject(value);
                try { target.put(`s${sourceIndex}_${name}`, copied); } finally { copied.destroy(); }
              } finally { value.destroy(); }
            }); } finally { target.destroy(); }
          } finally { category.destroy(); }
        });
      } finally { dr.destroy(); }
    });
    for (const item of pages) {
      const source = sources[item.sourceIndex]; const map = maps[item.sourceIndex];
      const sourcePage = source.findPage(item.sourcePageIndex); const outputPage = destination.findPage(item.outputPageIndex);
      const annots = sourcePage.get("Annots"); const outputAnnots = destination.newArray();
      const relationCopies = new Map<number, Obj>(); const pending: Array<{ original: Obj; copied: Obj }> = [];
      const pageKey = `${item.sourceIndex}:${item.sourcePageIndex}`; const repeat = occurrence.get(pageKey) ?? 0; occurrence.set(pageKey, repeat + 1);
      try {
        for (let index = 0; index < annots.length; index++) {
          const original = annots.get(index); const dict = destination.newDictionary();
          try {
            original.forEach((value, key) => {
              try {
                if (typeof key !== "string" || !ANNOTATION_KEYS.has(key)) return;
                const copied = map.graftObject(value);
                try { dict.put(key, copied); } finally { copied.destroy(); }
              } finally { value.destroy(); }
            });
            dict.put("P", outputPage);
            const subtype = original.get("Subtype"); const isWidget = text(subtype) === "Widget"; subtype.destroy();
            if (isWidget) {
              // Field names/default appearances live on the new terminal field.
              dict.delete("T"); dict.delete("DA");
              const chain = fieldChain(original);
              try {
                const parts = chain.map((entry) => { const name = entry.get("T"); try { return text(name); } finally { name.destroy(); } }).filter(Boolean).reverse();
                const fieldName = parts.join(".") || `field_${item.sourcePageIndex}_${index}`;
                const key = `${item.sourceIndex}:${fieldName}:${repeat}`;
                let field = fieldCopies.get(key);
                if (!field) {
                  const fieldDict = destination.newDictionary();
                  try {
                    for (const name of FIELD_KEYS) {
                      const value = inherited(chain, name);
                      if (value) { try { const copy = map.graftObject(value); try { fieldDict.put(name, copy); } finally { copy.destroy(); } } finally { value.destroy(); } }
                    }
                    const type = fieldDict.get("FT");
                    // A rewritten PDF cannot retain a valid source signature. Its
                    // visible appearance remains, but never publish an old /V as valid.
                    if (text(type) === "Sig") { fieldDict.delete("V"); fieldDict.delete("DV"); }
                    type.destroy();
                    let unique = fieldName; let suffix = 2;
                    while (names.has(unique)) unique = `${fieldName} (${suffix++})`;
                    names.add(unique); putString(destination, fieldDict, "T", unique);
                    const da = inherited(chain, "DA") ?? defaults[item.sourceIndex].get("DA");
                    try {
                      const renamed = text(da).replace(/\/([^\s/]+)(?=\s+[-+\d.]+\s+Tf\b)/g, `/s${item.sourceIndex}_$1`);
                      if (renamed) putString(destination, fieldDict, "DA", renamed);
                    } finally { da.destroy(); }
                    fieldDict.put("Kids", []); field = destination.addObject(fieldDict); fieldCopies.set(key, field); fields.push(field);
                  } finally { fieldDict.destroy(); }
                }
                dict.put("Parent", field);
              } finally { chain.forEach((entry) => entry.destroy()); }
            }
            // URI links are retained; GoTo destinations are rebased only to pages
            // actually present in this output. Never copy a destination page graph.
            const action = original.get("A"); const actionType = action.isNull() ? destination.newNull() : action.get("S");
            try {
              if (text(actionType) === "URI") {
                const uri = action.get("URI");
                try {
                  if (uri.isString() && /^(?:https?:|mailto:|tel:)/i.test(uri.asString())) {
                    const safe = destination.newDictionary();
                    try { safe.put("S", "URI"); putString(destination, safe, "URI", uri.asString()); dict.put("A", safe); } finally { safe.destroy(); }
                  }
                } finally { uri.destroy(); }
              } else {
                let dest = text(actionType) === "GoTo" ? action.get("D") : original.get("Dest");
                try {
                  if (dest.isString() || dest.isName()) {
                    const targetIndex = source.resolveLink(`#nameddest=${encodeURIComponent(text(dest))}`);
                    const matched = pages.find((p) => p.sourceIndex === item.sourceIndex && p.sourcePageIndex === targetIndex);
                    if (matched) { const target = destination.findPage(matched.outputPageIndex); try { dict.put("Dest", [target, "Fit"]); } finally { target.destroy(); } }
                  } else if (dest.isArray() && dest.length) {
                    const target = dest.get(0);
                    const sourceIndex = target.isIndirect() ? originalPageRefs[item.sourceIndex].get(target.asIndirect()) : target.isNumber() ? target.asNumber() : undefined;
                    target.destroy();
                    // A self-link on a duplicated page should point to that copy.
                    const matched = sourceIndex === item.sourcePageIndex ? item : pages.find((p) => p.sourceIndex === item.sourceIndex && p.sourcePageIndex === sourceIndex);
                    if (matched) {
                      const rebased = destination.newArray(); const ref = destination.findPage(matched.outputPageIndex);
                      try {
                        rebased.push(ref);
                        for (let component = 1; component < dest.length; component++) {
                          const value = dest.get(component);
                          try { if (!value.isNumber() && !value.isNull() && !value.isName()) throw new Error("Invalid internal PDF link destination."); const copy = map.graftObject(value); try { rebased.push(copy); } finally { copy.destroy(); } } finally { value.destroy(); }
                        }
                        dict.put("Dest", rebased);
                      } finally { ref.destroy(); rebased.destroy(); }
                    }
                  }
                } finally { dest.destroy(); }
              }
            } finally { actionType.destroy(); action.destroy(); }
            const copied = destination.addObject(dict); outputAnnots.push(copied);
            if (isWidget) { const field = copied.get("Parent"); const kids = field.get("Kids"); try { kids.push(copied); } finally { kids.destroy(); field.destroy(); } }
            if (original.isIndirect()) relationCopies.set(original.asIndirect(), copied);
            pending.push({ original, copied });
          } catch (error) { original.destroy(); throw error; }
          finally { dict.destroy(); }
        }
        // Popups and replies are linked only to copied annotations on this page.
        for (const { original, copied } of pending) for (const key of ["Popup", "IRT", "Parent"]) {
          const subtype = original.get("Subtype"); const widget = text(subtype) === "Widget"; subtype.destroy();
          if (key === "Parent" && widget) continue;
          const relation = original.get(key);
          try { const target = relation.isIndirect() ? relationCopies.get(relation.asIndirect()) : undefined; if (target) copied.put(key, target); } finally { relation.destroy(); }
        }
        if (outputAnnots.length) outputPage.put("Annots", outputAnnots);
      } finally {
        pending.forEach(({ original, copied }) => { original.destroy(); copied.destroy(); });
        outputAnnots.destroy(); annots.destroy(); sourcePage.destroy(); outputPage.destroy();
      }
    }
    if (fields.length) {
      form.put("Fields", fields); form.put("DR", resources); form.put("NeedAppearances", false); root.put("AcroForm", form);
      // Generate missing widget appearances after field resources are installed.
      for (let index = 0; index < destination.countPages(); index++) { const page = destination.loadPage(index); try { page.update(); } finally { page.destroy(); } }
    }
  } finally {
    fieldCopies.forEach((field) => field.destroy()); defaults.forEach((entry) => entry.destroy());
    resources.destroy(); fields.destroy(); form.destroy(); root.destroy();
  }
}

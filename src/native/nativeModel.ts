import type {
  NativeCapability,
  NativeFormFieldType,
  NativeRect,
  NativeScript,
  NativeTableCell,
  NativeTableObject,
  NativeTextObject
} from "../types/nativeEditor";

export function detectScript(text: string): NativeScript {
  let latin = false;
  let ko = false;
  let ja = false;
  let hans = false;
  let hant = false;
  let complex = false;
  const hanOnlyJapanese = /日本|日本語/.test(text);
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x41 && code <= 0x24f) || (code >= 0x1e00 && code <= 0x1eff)) latin = true;
    else if ((code >= 0xac00 && code <= 0xd7af) || (code >= 0x1100 && code <= 0x11ff)) ko = true;
    else if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) ja = true;
    else if (code >= 0x4e00 && code <= 0x9fff) {
      if ("國學體龍門萬與為雲臺灣廣東書長會國華漢".includes(ch)) hant = true;
      else hans = true;
    } else if ((code >= 0x0590 && code <= 0x0dff) || (code >= 0xfb1d && code <= 0xfeff)) complex = true;
  }
  if (complex) return "complex";
  if (ko) return "cjk-ko";
  if (ja || hanOnlyJapanese) return "cjk-ja";
  if (hant) return "cjk-zh-hant";
  if (hans) return "cjk-zh-hans";
  if (latin || !text.trim()) return "latin";
  return "unknown";
}

function capability(level: NativeCapability["level"], label: string, confidence: number, reason: string, preserves: string[], risks: string[]): NativeCapability {
  return { level, label, confidence, reason, preserves, risks };
}

export function classifyTextEditability(text: string, fontName = ""): Pick<NativeTextObject, "script" | "editability" | "reason" | "capability"> {
  const script = detectScript(text);
  if (/type3|symbol|dingbat|identity/i.test(fontName)) {
    const reason = "The source font encoding cannot be reconstructed safely.";
    return { script, editability: "overlay-only", reason, capability: capability("appearance-only", "Appearance edit", 0.5, reason, ["Original source project"], ["Replacement is exported as an annotation overlay unless a compatible font is supplied."]) };
  }
  if (script === "latin") {
    const reason = "The text can be reconstructed inside its existing bounding box.";
    return { script, editability: "fixed-box", reason, capability: capability("safe-reconstruction", "Safe reconstruction", 0.92, reason, ["Page geometry", "Unchanged neighboring objects"], ["The original text operators and font resource are replaced rather than edited byte-for-byte."]) };
  }
  if (["cjk-ko", "cjk-ja", "cjk-zh-hans", "cjk-zh-hant"].includes(script)) {
    const reason = "The text can be rebuilt with a UTF-16 CJK CID font inside its existing box.";
    return { script, editability: "cjk-fixed-box", reason, capability: capability("safe-reconstruction", "CJK reconstruction", 0.86, reason, ["Unicode text", "Page geometry"], ["Exact original glyph metrics may differ from the source font."]) };
  }
  if (script === "complex") {
    const reason = "This script requires shaping and bidirectional layout that the current browser editor does not safely reconstruct.";
    return { script, editability: "overlay-only", reason, capability: capability("appearance-only", "Appearance only", 0.45, reason, ["Original source project"], ["Static replacement is not attempted without a shaping engine."]) };
  }
  const reason = "The text encoding could not be classified safely.";
  return { script, editability: "unsupported", reason, capability: capability("unsupported", "Unsupported", 0.2, reason, ["Original source project"], ["Editing this object may corrupt text encoding."]) };
}

export function imageCapability(): NativeCapability {
  return capability("safe-reconstruction", "Region replacement", 0.9, "The detected image region can be replaced while leaving other page regions intact.", ["Page count", "Unchanged page regions"], ["Overlapping content inside the replacement region can be removed when permanent replacement is enabled."]);
}

export function vectorCapability(commandCount: number): NativeCapability {
  return capability("safe-reconstruction", "Vector reconstruction", commandCount <= 12 ? 0.84 : 0.68, "The detected path can be restyled or transformed by reconstructing its path commands.", ["Vector output", "Unchanged page regions"], ["Only the detected path region is reconstructed; complex clipping, blend modes, and inherited graphics state may differ."]);
}

export function tableCapability(confidence: number): NativeCapability {
  return capability("safe-reconstruction", "Cell reconstruction", confidence, "Detected table cells can be edited independently inside their existing boxes.", ["Table geometry", "Unedited cells"], ["Table detection is inferred from aligned text and may not capture merged cells or border semantics."]);
}

export function formCapability(type: NativeFormFieldType, readOnly: boolean, signed: boolean | null): NativeCapability {
  if (type === "signature" || signed) return capability("unsupported", "Signature protected", 1, "Signature fields are not modified by the unified content editor.", ["Existing signature field"], ["Changing signed fields can invalidate signatures."]);
  if (readOnly) return capability("unsupported", "Read only", 1, "This field is marked read-only in the PDF.", ["Field value and flags"], []);
  if (["text", "combobox", "listbox", "checkbox", "radiobutton"].includes(type)) return capability("native-safe", "Native field edit", 0.98, "The field value can be changed through the PDF widget API without flattening it.", ["Interactive form structure", "Field geometry"], []);
  return capability("unsupported", "Unsupported field", 0.5, "This field type is not value-editable in the unified editor.", ["Field structure"], []);
}

export function rectFromArray(value: unknown): NativeRect {
  const a = Array.isArray(value) ? value.map(Number) : [];
  const x0 = Number.isFinite(a[0]) ? a[0] : 0;
  const y0 = Number.isFinite(a[1]) ? a[1] : 0;
  const x1 = Number.isFinite(a[2]) ? a[2] : x0;
  const y1 = Number.isFinite(a[3]) ? a[3] : y0;
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function unionRects(rects: NativeRect[]): NativeRect {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x1 - x, h: y1 - y };
}

interface Line { id: string; text: string; bounds: NativeRect; fontSize: number }

function overlap(a: NativeRect, b: NativeRect): number {
  return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) / Math.max(1, Math.min(a.h, b.h));
}

export function detectTables(pageNumber: number, lines: Line[]): NativeTableObject[] {
  if (lines.length < 4) return [];
  const rows: Line[][] = [];
  for (const line of [...lines].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)) {
    const row = rows.find((items) => items.some((item) => overlap(item.bounds, line.bounds) >= 0.55));
    row ? row.push(line) : rows.push([line]);
  }
  const candidates = rows.filter((row) => row.length >= 2).map((row) => row.sort((a, b) => a.bounds.x - b.bounds.x));
  if (candidates.length < 2) return [];
  const columns = Math.max(...candidates.map((row) => row.length));
  const compatible = candidates.filter((row) => Math.abs(row.length - columns) <= 1);
  if (compatible.length < 2 || columns < 2) return [];
  const cells: NativeTableCell[] = [];
  compatible.forEach((row, ri) => row.forEach((line, ci) => cells.push({ id: `table:${pageNumber}:r${ri}:c${ci}:${line.id}`, row: ri, column: ci, text: line.text, bounds: line.bounds, fontSize: line.fontSize })));
  const confidence = Math.max(0.6, Math.min(0.94, 0.72 + compatible.length * 0.025 + columns * 0.02));
  return [{ id: `table:${pageNumber}:0`, type: "table", pageNumber, bounds: unionRects(cells.map((cell) => cell.bounds)), rows: compatible.length, columns, cells, confidence, editability: "cell-replace", capability: tableCapability(confidence) }];
}

export function wrapTextToBox(text: string, width: number, size: number): string[] {
  const max = Math.max(1, Math.floor(width / Math.max(1, size * 0.52)));
  const normalized = text.trim();
  if (!normalized) return [""];
  if (!/\s/.test(normalized)) {
    const characters = [...normalized];
    const lines: string[] = [];
    for (let index = 0; index < characters.length; index += max) lines.push(characters.slice(index, index + max).join(""));
    return lines;
  }
  const words = normalized.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= max) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

export function cjkLanguageForScript(script: NativeScript): "ko" | "ja" | "zh-Hans" | "zh-Hant" | undefined {
  if (script === "cjk-ko") return "ko";
  if (script === "cjk-ja") return "ja";
  if (script === "cjk-zh-hans") return "zh-Hans";
  if (script === "cjk-zh-hant") return "zh-Hant";
  return undefined;
}

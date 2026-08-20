import * as mupdf from "mupdf";
import type {
  NativeCapability,
  NativeExportReport,
  NativePathCommand,
  NativeRect,
  NativeVectorColorSpace,
  NativeVectorEdit,
  NativeVectorLineCap,
  NativeVectorLineJoin,
  NativeVectorObject,
  NativeVectorPaint
} from "../types/nativeEditor";

type Request =
  | { type: "INSPECT_VECTORS"; requestId: string; bytes: ArrayBuffer; password?: string }
  | { type: "APPLY_VECTORS"; requestId: string; bytes: ArrayBuffer; password?: string; edits?: NativeVectorEdit[] }
  | { type: "CANCEL"; requestId: string };

type PdfDocument = any;
type PdfPage = any;
type PdfObject = any;

type Matrix = [number, number, number, number, number, number];

type Operand = number | string | number[];

interface Token {
  value: string;
  start: number;
  end: number;
  kind: "number" | "name" | "word" | "array" | "string";
  arrayValue?: number[];
}

interface GraphicsState {
  ctm: Matrix;
  fillSpace: NativeVectorColorSpace;
  strokeSpace: NativeVectorColorSpace;
  fillComponents: number[];
  strokeComponents: number[];
  lineWidth: number;
  lineCap: NativeVectorLineCap;
  lineJoin: NativeVectorLineJoin;
  miterLimit: number;
  dashPattern: number[];
  dashPhase: number;
  fillAlpha: number;
  strokeAlpha: number;
  blendMode: string;
  clipped: boolean;
}

interface ParsedVector {
  object: NativeVectorObject;
  streamIndex: number;
  pathIndex: number;
  start: number;
  end: number;
  ctm: Matrix;
  paintOperator: "S" | "f" | "f*" | "B" | "B*";
}

interface VectorPageInspection {
  pageNumber: number;
  vectors: NativeVectorObject[];
  warnings: string[];
}

interface VectorInspection {
  pages: VectorPageInspection[];
  total: number;
  warnings: string[];
}

const cancelled = new Set<string>();
let resourceSequence = 0;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value: number, digits = 4): number {
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

function point(matrix: Matrix | number[], x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

function inverse(matrix: Matrix | number[]): Matrix {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return [...IDENTITY];
  return [d / determinant, -b / determinant, -c / determinant, a / determinant, (c * f - d * e) / determinant, (b * e - a * f) / determinant];
}

function pageToPdfMatrix(page: PdfPage): Matrix {
  const value = page.getTransform?.() ?? IDENTITY;
  return [finite(value[0], 1), finite(value[1]), finite(value[2]), finite(value[3], 1), finite(value[4]), finite(value[5])];
}

function pdfToPageMatrix(page: PdfPage): Matrix {
  return inverse(pageToPdfMatrix(page));
}

function transformCommand(command: NativePathCommand, matrix: Matrix): NativePathCommand {
  if (command.op === "Z") return command;
  if (command.op === "C") {
    const p1 = point(matrix, command.x1, command.y1);
    const p2 = point(matrix, command.x2, command.y2);
    const p3 = point(matrix, command.x3, command.y3);
    return { op: "C", x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], x3: p3[0], y3: p3[1] };
  }
  const p = point(matrix, command.x, command.y);
  return { op: command.op, x: p[0], y: p[1] };
}

function commandsSignature(commands: NativePathCommand[], paint: NativeVectorPaint): string {
  const body = commands.map((command) => {
    if (command.op === "Z") return "Z";
    if (command.op === "C") return `C:${round(command.x1, 2)},${round(command.y1, 2)},${round(command.x2, 2)},${round(command.y2, 2)},${round(command.x3, 2)},${round(command.y3, 2)}`;
    return `${command.op}:${round(command.x, 2)},${round(command.y, 2)}`;
  }).join(";");
  return `${paint}|${body}`;
}

function rectFromArray(value: unknown): NativeRect {
  const values = Array.isArray(value) ? value.map(Number) : [];
  const x0 = finite(values[0]);
  const y0 = finite(values[1]);
  const x1 = finite(values[2], x0);
  const y1 = finite(values[3], y0);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

function fitzRectFromPdf(page: PdfPage, rect: NativeRect): NativeRect {
  const matrix = pdfToPageMatrix(page);
  const corners = [
    point(matrix, rect.x, rect.y),
    point(matrix, rect.x + rect.w, rect.y),
    point(matrix, rect.x + rect.w, rect.y + rect.h),
    point(matrix, rect.x, rect.y + rect.h)
  ];
  const x = Math.min(...corners.map((item) => item[0]));
  const y = Math.min(...corners.map((item) => item[1]));
  const x1 = Math.max(...corners.map((item) => item[0]));
  const y1 = Math.max(...corners.map((item) => item[1]));
  return { x, y, w: x1 - x, h: y1 - y };
}

function pathBounds(page: PdfPage, localCommands: NativePathCommand[], state: GraphicsState, paint: NativeVectorPaint): NativeRect {
  try {
    const path = new (mupdf as any).Path();
    for (const command of localCommands) {
      if (command.op === "M") path.moveTo(command.x, command.y);
      else if (command.op === "L") path.lineTo(command.x, command.y);
      else if (command.op === "C") path.curveTo(command.x1, command.y1, command.x2, command.y2, command.x3, command.y3);
      else path.closePath();
    }
    const stroke = paint === "fill" ? null : new (mupdf as any).StrokeState({
      lineCap: state.lineCap,
      lineJoin: state.lineJoin,
      lineWidth: state.lineWidth,
      miterLimit: state.miterLimit,
      dashPhase: state.dashPhase,
      dashPattern: state.dashPattern
    });
    const bounds = rectFromArray(path.getBounds(stroke, state.ctm));
    path.destroy?.();
    stroke?.destroy?.();
    return fitzRectFromPdf(page, bounds);
  } catch {
    const transformed = localCommands.map((command) => transformCommand(command, state.ctm)).map((command) => transformCommand(command, pdfToPageMatrix(page)));
    const points: Array<[number, number]> = [];
    for (const command of transformed) {
      if (command.op === "M" || command.op === "L") points.push([command.x, command.y]);
      else if (command.op === "C") points.push([command.x1, command.y1], [command.x2, command.y2], [command.x3, command.y3]);
    }
    if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
    const pad = paint === "fill" ? 0 : state.lineWidth / 2;
    const x = Math.min(...points.map((item) => item[0])) - pad;
    const y = Math.min(...points.map((item) => item[1])) - pad;
    const x1 = Math.max(...points.map((item) => item[0])) + pad;
    const y1 = Math.max(...points.map((item) => item[1])) + pad;
    return { x, y, w: x1 - x, h: y1 - y };
  }
}

function colorSpace(value: string): NativeVectorColorSpace {
  const normalized = value.replace(/^\//, "");
  if (/gray/i.test(normalized)) return "Gray";
  if (/devicebgr|bgr/i.test(normalized)) return "BGR";
  if (/rgb/i.test(normalized)) return "RGB";
  if (/cmyk/i.test(normalized)) return "CMYK";
  if (/lab/i.test(normalized)) return "Lab";
  if (/indexed/i.test(normalized)) return "Indexed";
  if (/separation|devicen/i.test(normalized)) return "Separation";
  return "Unknown";
}

function byteHex(value: number): string {
  return Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, "0");
}

function componentsToHex(space: NativeVectorColorSpace, components: number[]): string | undefined {
  let r: number;
  let g: number;
  let b: number;
  if (space === "Gray") r = g = b = finite(components[0]);
  else if (space === "RGB") [r, g, b] = [finite(components[0]), finite(components[1]), finite(components[2])];
  else if (space === "BGR") [b, g, r] = [finite(components[0]), finite(components[1]), finite(components[2])];
  else if (space === "CMYK") {
    const c = finite(components[0]);
    const m = finite(components[1]);
    const y = finite(components[2]);
    const k = finite(components[3]);
    r = 1 - Math.min(1, c + k);
    g = 1 - Math.min(1, m + k);
    b = 1 - Math.min(1, y + k);
  } else return undefined;
  return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
}

function capabilityForVector(commands: NativePathCommand[], state: GraphicsState, definesClip: boolean): NativeCapability {
  if (definesClip) return {
    level: "unsupported",
    label: "Clip-protected path",
    confidence: 1,
    reason: "This vector path also defines a clipping boundary for later PDF content, so editing it could change unrelated content.",
    preserves: ["Original clipping behavior", "Following PDF content"],
    risks: ["Direct editing is intentionally blocked until nested clipping is handled as a first-class object."]
  };
  const complexColor = [state.fillSpace, state.strokeSpace].some((space) => ["Lab", "Indexed", "Separation", "Unknown"].includes(space));
  const complexBlend = state.blendMode !== "Normal";
  const confidence = clamp(0.98 - (commands.length > 100 ? 0.06 : 0) - (state.clipped ? 0.06 : 0) - (complexColor ? 0.05 : 0) - (complexBlend ? 0.05 : 0), 0.72, 0.98);
  return {
    level: complexBlend || state.clipped ? "safe-reconstruction" : "native-safe",
    label: complexBlend || state.clipped ? "Source path edit" : "Direct path edit",
    confidence,
    reason: "The path is stored directly in the page content stream and can be rewritten at its exact source operator range.",
    preserves: ["Neighboring text and images", "Unrelated vector paths", "Bézier geometry", "Inherited source graphics state unless appearance override is enabled"],
    risks: [
      ...(state.clipped ? ["The path is drawn inside an existing clipping boundary, so transformed geometry may remain clipped."] : []),
      ...(complexBlend ? [`The source uses ${state.blendMode} blending; source appearance is preserved for geometry-only edits.`] : []),
      ...(complexColor ? ["The source uses a complex color space; geometry-only edits preserve it, while appearance override converts the edited path to DeviceRGB."] : [])
    ]
  };
}

function defaultState(): GraphicsState {
  return {
    ctm: [...IDENTITY],
    fillSpace: "Gray",
    strokeSpace: "Gray",
    fillComponents: [0],
    strokeComponents: [0],
    lineWidth: 1,
    lineCap: "Butt",
    lineJoin: "Miter",
    miterLimit: 10,
    dashPattern: [],
    dashPhase: 0,
    fillAlpha: 1,
    strokeAlpha: 1,
    blendMode: "Normal",
    clipped: false
  };
}

function cloneState(state: GraphicsState): GraphicsState {
  return {
    ...state,
    ctm: [...state.ctm],
    fillComponents: [...state.fillComponents],
    strokeComponents: [...state.strokeComponents],
    dashPattern: [...state.dashPattern]
  };
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
    if (code === 60 && source.charCodeAt(index + 1) !== 60) {
      const start = index;
      index += 1;
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
    if (code === 91) {
      const start = index++;
      const values: number[] = [];
      while (index < source.length) {
        while (index < source.length && isWhitespace(source.charCodeAt(index))) index += 1;
        if (source.charCodeAt(index) === 93) { index += 1; break; }
        const numberStart = index;
        while (index < source.length && !isDelimiter(source.charCodeAt(index))) index += 1;
        const numeric = Number(source.slice(numberStart, index));
        if (Number.isFinite(numeric)) values.push(numeric);
        else {
          while (index < source.length && source.charCodeAt(index) !== 93) index += 1;
        }
      }
      tokens.push({ value: source.slice(start, index), start, end: index, kind: "array", arrayValue: values });
      continue;
    }
    if ((code >= 48 && code <= 57) || code === 43 || code === 45 || code === 46) {
      const start = index++;
      while (index < source.length && !isDelimiter(source.charCodeAt(index))) index += 1;
      const value = source.slice(start, index);
      if (Number.isFinite(Number(value))) tokens.push({ value, start, end: index, kind: "number" });
      else tokens.push({ value, start, end: index, kind: "word" });
      continue;
    }
    const start = index++;
    while (index < source.length && !isDelimiter(source.charCodeAt(index))) index += 1;
    const value = source.slice(start, index);
    if (value === "BI") inlineImage = true;
    tokens.push({ value, start, end: index, kind: "word" });
  }
  return { tokens, inlineImage };
}

function tokenOperand(token: Token): Operand | undefined {
  if (token.kind === "number") return Number(token.value);
  if (token.kind === "name") return token.value.slice(1);
  if (token.kind === "array") return token.arrayValue ?? [];
  if (token.kind === "string") return token.value;
  return undefined;
}

function numericOperands(stack: Array<{ value: Operand; token: Token }>, count: number): number[] | undefined {
  if (stack.length < count) return undefined;
  const values = stack.slice(-count).map((item) => Number(item.value));
  return values.every(Number.isFinite) ? values : undefined;
}

function extGraphicsState(page: PdfPage, name: string): Partial<GraphicsState> {
  return safe(() => {
    const object = page.getObject();
    let resources = object.get("Resources");
    if (!resources?.isDictionary?.()) resources = object.getInheritable?.("Resources");
    const states = resources?.get?.("ExtGState");
    const raw = states?.get?.(name);
    const gs = raw?.resolve?.() ?? raw;
    if (!gs?.isDictionary?.()) return {};
    const fillAlpha = finite(gs.get("ca")?.valueOf?.(), Number.NaN);
    const strokeAlpha = finite(gs.get("CA")?.valueOf?.(), Number.NaN);
    const bm = gs.get("BM");
    const blend = String(bm?.valueOf?.() ?? "Normal").replace(/^\//, "");
    return {
      ...(Number.isFinite(fillAlpha) ? { fillAlpha: clamp(fillAlpha, 0, 1) } : {}),
      ...(Number.isFinite(strokeAlpha) ? { strokeAlpha: clamp(strokeAlpha, 0, 1) } : {}),
      ...(blend ? { blendMode: blend } : {})
    };
  }, {} as Partial<GraphicsState>);
}

function paintFromOperator(operator: string): NativeVectorPaint | undefined {
  if (["S", "s"].includes(operator)) return "stroke";
  if (["f", "F", "f*"].includes(operator)) return "fill";
  if (["B", "B*", "b", "b*"].includes(operator)) return "fill-stroke";
  return undefined;
}

function canonicalPaintOperator(operator: string): "S" | "f" | "f*" | "B" | "B*" {
  if (["S", "s"].includes(operator)) return "S";
  if (["f", "F"].includes(operator)) return "f";
  if (operator === "f*") return "f*";
  if (["B", "b"].includes(operator)) return "B";
  return "B*";
}

function parseStream(page: PdfPage, source: string, streamIndex: number): { records: ParsedVector[]; inlineImage: boolean } {
  const { tokens, inlineImage } = tokenize(source);
  if (inlineImage) return { records: [], inlineImage: true };
  const records: ParsedVector[] = [];
  const stateStack: GraphicsState[] = [];
  let state = defaultState();
  const operands: Array<{ value: Operand; token: Token }> = [];
  let path: NativePathCommand[] = [];
  let pathStart = -1;
  let current: [number, number] | undefined;
  let subpathStart: [number, number] | undefined;
  let pendingClip = false;
  let pendingClipEvenOdd = false;
  let pathIndex = 0;

  function clearPath(): void {
    path = [];
    pathStart = -1;
    current = undefined;
    subpathStart = undefined;
    pendingClip = false;
    pendingClipEvenOdd = false;
  }

  function startFromOperands(count: number): void {
    if (pathStart >= 0 || operands.length < count) return;
    pathStart = operands[operands.length - count].token.start;
  }

  for (const token of tokens) {
    const operand = tokenOperand(token);
    if (operand !== undefined) { operands.push({ value: operand, token }); continue; }
    const op = token.value;
    const nums = (count: number) => numericOperands(operands, count);

    if (op === "q") { stateStack.push(cloneState(state)); operands.length = 0; continue; }
    if (op === "Q") { state = stateStack.pop() ?? defaultState(); operands.length = 0; clearPath(); continue; }
    if (op === "cm") {
      const values = nums(6);
      if (values) state.ctm = multiply(state.ctm, values as Matrix);
      operands.length = 0;
      continue;
    }
    if (op === "w") { const values = nums(1); if (values) state.lineWidth = Math.max(0, values[0]); operands.length = 0; continue; }
    if (op === "J") { const values = nums(1); if (values) state.lineCap = values[0] === 1 ? "Round" : values[0] === 2 ? "Square" : "Butt"; operands.length = 0; continue; }
    if (op === "j") { const values = nums(1); if (values) state.lineJoin = values[0] === 1 ? "Round" : values[0] === 2 ? "Bevel" : "Miter"; operands.length = 0; continue; }
    if (op === "M") { const values = nums(1); if (values) state.miterLimit = Math.max(1, values[0]); operands.length = 0; continue; }
    if (op === "d") {
      const phase = operands.at(-1);
      const pattern = operands.at(-2);
      if (Array.isArray(pattern?.value) && typeof phase?.value === "number") {
        state.dashPattern = pattern.value.map((value) => Math.max(0, finite(value)));
        state.dashPhase = finite(phase.value);
      }
      operands.length = 0;
      continue;
    }
    if (op === "g" || op === "G") {
      const values = nums(1);
      if (values) {
        if (op === "g") { state.fillSpace = "Gray"; state.fillComponents = values; }
        else { state.strokeSpace = "Gray"; state.strokeComponents = values; }
      }
      operands.length = 0;
      continue;
    }
    if (op === "rg" || op === "RG") {
      const values = nums(3);
      if (values) {
        if (op === "rg") { state.fillSpace = "RGB"; state.fillComponents = values; }
        else { state.strokeSpace = "RGB"; state.strokeComponents = values; }
      }
      operands.length = 0;
      continue;
    }
    if (op === "k" || op === "K") {
      const values = nums(4);
      if (values) {
        if (op === "k") { state.fillSpace = "CMYK"; state.fillComponents = values; }
        else { state.strokeSpace = "CMYK"; state.strokeComponents = values; }
      }
      operands.length = 0;
      continue;
    }
    if (op === "cs" || op === "CS") {
      const name = operands.at(-1)?.value;
      if (typeof name === "string") {
        if (op === "cs") state.fillSpace = colorSpace(name);
        else state.strokeSpace = colorSpace(name);
      }
      operands.length = 0;
      continue;
    }
    if (op === "sc" || op === "scn" || op === "SC" || op === "SCN") {
      const values = operands.map((item) => Number(item.value)).filter(Number.isFinite);
      if (op === "sc" || op === "scn") state.fillComponents = values;
      else state.strokeComponents = values;
      operands.length = 0;
      continue;
    }
    if (op === "gs") {
      const name = operands.at(-1)?.value;
      if (typeof name === "string") Object.assign(state, extGraphicsState(page, name));
      operands.length = 0;
      continue;
    }

    if (op === "m") {
      const values = nums(2);
      if (values) {
        startFromOperands(2);
        path.push({ op: "M", x: values[0], y: values[1] });
        current = [values[0], values[1]];
        subpathStart = current;
      }
      operands.length = 0;
      continue;
    }
    if (op === "l") {
      const values = nums(2);
      if (values) { startFromOperands(2); path.push({ op: "L", x: values[0], y: values[1] }); current = [values[0], values[1]]; }
      operands.length = 0;
      continue;
    }
    if (op === "c") {
      const values = nums(6);
      if (values) {
        startFromOperands(6);
        path.push({ op: "C", x1: values[0], y1: values[1], x2: values[2], y2: values[3], x3: values[4], y3: values[5] });
        current = [values[4], values[5]];
      }
      operands.length = 0;
      continue;
    }
    if (op === "v") {
      const values = nums(4);
      if (values && current) {
        startFromOperands(4);
        path.push({ op: "C", x1: current[0], y1: current[1], x2: values[0], y2: values[1], x3: values[2], y3: values[3] });
        current = [values[2], values[3]];
      }
      operands.length = 0;
      continue;
    }
    if (op === "y") {
      const values = nums(4);
      if (values) {
        startFromOperands(4);
        path.push({ op: "C", x1: values[0], y1: values[1], x2: values[2], y2: values[3], x3: values[2], y3: values[3] });
        current = [values[2], values[3]];
      }
      operands.length = 0;
      continue;
    }
    if (op === "h") {
      if (path.length) { if (pathStart < 0) pathStart = token.start; path.push({ op: "Z" }); current = subpathStart; }
      operands.length = 0;
      continue;
    }
    if (op === "re") {
      const values = nums(4);
      if (values) {
        startFromOperands(4);
        const [x, y, w, h] = values;
        path.push({ op: "M", x, y }, { op: "L", x: x + w, y }, { op: "L", x: x + w, y: y + h }, { op: "L", x, y: y + h }, { op: "Z" });
        current = [x, y];
        subpathStart = [x, y];
      }
      operands.length = 0;
      continue;
    }
    if (op === "W" || op === "W*") {
      pendingClip = true;
      pendingClipEvenOdd = op === "W*";
      operands.length = 0;
      continue;
    }

    const paint = paintFromOperator(op);
    if (paint || op === "n") {
      if (["s", "b", "b*"].includes(op) && path.length && path.at(-1)?.op !== "Z") path.push({ op: "Z" });
      const definesClip = pendingClip;
      if (paint && path.length && pathStart >= 0) {
        const pageCommands = path.map((command) => transformCommand(command, state.ctm)).map((command) => transformCommand(command, pdfToPageMatrix(page)));
        const evenOdd = ["f*", "B*", "b*"].includes(op) || pendingClipEvenOdd;
        const bounds = pathBounds(page, path, state, paint);
        const signature = commandsSignature(pageCommands, paint);
        const capability = capabilityForVector(pageCommands, state, definesClip);
        const object: NativeVectorObject = {
          id: `p${safe(() => page.getObject().get("StructParents")?.valueOf?.(), "") || "x"}:vector:s${streamIndex}:${pathIndex}:${signature.slice(0, 18)}`,
          type: "vector",
          pageNumber: 0,
          bounds,
          commands: pageCommands,
          paint,
          fillColor: paint !== "stroke" ? componentsToHex(state.fillSpace, state.fillComponents) : undefined,
          strokeColor: paint !== "fill" ? componentsToHex(state.strokeSpace, state.strokeComponents) : undefined,
          fillColorSpace: state.fillSpace,
          strokeColorSpace: state.strokeSpace,
          fillComponents: [...state.fillComponents],
          strokeComponents: [...state.strokeComponents],
          lineWidth: state.lineWidth,
          lineCap: state.lineCap,
          lineJoin: state.lineJoin,
          miterLimit: state.miterLimit,
          dashPattern: [...state.dashPattern],
          dashPhase: state.dashPhase,
          fillAlpha: state.fillAlpha,
          strokeAlpha: state.strokeAlpha,
          evenOdd,
          blendMode: state.blendMode,
          clipped: state.clipped,
          definesClip,
          sourceStreamIndex: streamIndex,
          sourcePathIndex: pathIndex,
          sourceSignature: signature,
          editability: definesClip ? "clip-protected" : "source-path",
          capability
        };
        records.push({ object, streamIndex, pathIndex, start: pathStart, end: token.end, ctm: [...state.ctm], paintOperator: canonicalPaintOperator(op) });
        pathIndex += 1;
      }
      if (definesClip) state.clipped = true;
      clearPath();
      operands.length = 0;
      continue;
    }

    // Any unrelated operator consumes its operands. Path construction remains active
    // because PDF permits graphics-state-independent operators between subpaths.
    operands.length = 0;
  }
  return { records, inlineImage: false };
}

function streamBytes(ref: PdfObject): Uint8Array {
  const buffer = ref.readStream();
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy?.(); }
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

function inspectPage(page: PdfPage, pageNumber: number): VectorPageInspection {
  const warnings: string[] = [];
  const vectors: NativeVectorObject[] = [];
  const streams = contentStreams(page);
  streams.forEach((stream, streamIndex) => {
    const parsed = parseStream(page, byteString(streamBytes(stream)), streamIndex);
    if (parsed.inlineImage) {
      warnings.push(`Page ${pageNumber} content stream ${streamIndex + 1} contains an inline image; direct vector rewriting in that stream is disabled to preserve binary image data.`);
      return;
    }
    for (const record of parsed.records) {
      record.object.pageNumber = pageNumber;
      record.object.id = `p${pageNumber}:vector:s${record.streamIndex}:v${record.pathIndex}:${record.object.sourceSignature.slice(0, 24)}`;
      vectors.push(record.object);
    }
  });
  return { pageNumber, vectors, warnings };
}

function inspect(pdf: PdfDocument, requestId: string): VectorInspection {
  const pages: VectorPageInspection[] = [];
  const warnings: string[] = [];
  let total = 0;
  for (let index = 0; index < pdf.countPages(); index += 1) {
    active(requestId);
    const page = pdf.loadPage(index);
    try {
      const result = inspectPage(page, index + 1);
      pages.push(result);
      total += result.vectors.length;
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

function findRecord(page: PdfPage, edit: NativeVectorEdit): { record: ParsedVector; stream: PdfObject; source: string } {
  const streams = contentStreams(page);
  const candidates: Array<{ record: ParsedVector; stream: PdfObject; source: string }> = [];
  streams.forEach((stream, streamIndex) => {
    const source = byteString(streamBytes(stream));
    const parsed = parseStream(page, source, streamIndex);
    if (parsed.inlineImage) return;
    for (const record of parsed.records) candidates.push({ record, stream, source });
  });
  if (!candidates.length) throw new Error(`P4 vector source not found on page ${edit.pageNumber}.`);
  const exact = candidates.find((candidate) => edit.sourceSignature && candidate.record.object.sourceSignature === edit.sourceSignature);
  if (exact) return exact;
  const indexed = candidates.find((candidate) => candidate.record.streamIndex === edit.sourceStreamIndex && candidate.record.pathIndex === edit.sourcePathIndex);
  if (indexed && rectDistance(indexed.record.object.bounds, edit.sourceBounds) <= Math.max(12, edit.sourceBounds.w * 0.2 + edit.sourceBounds.h * 0.2)) return indexed;
  const nearest = [...candidates].sort((a, b) => rectDistance(a.record.object.bounds, edit.sourceBounds) - rectDistance(b.record.object.bounds, edit.sourceBounds))[0];
  if (rectDistance(nearest.record.object.bounds, edit.sourceBounds) > Math.max(18, edit.sourceBounds.w * 0.35 + edit.sourceBounds.h * 0.35)) throw new Error(`P4 vector source could not be matched safely on page ${edit.pageNumber}.`);
  return nearest;
}

function mapDestinationPoint(x: number, y: number, source: NativeRect, destination: NativeRect, rotation: number): [number, number] {
  const sx = Math.abs(source.w) > 1e-9 ? (x - source.x) / source.w : 0.5;
  const sy = Math.abs(source.h) > 1e-9 ? (y - source.y) / source.h : 0.5;
  let mappedX = destination.x + sx * destination.w;
  let mappedY = destination.y + sy * destination.h;
  if (Math.abs(rotation) > 1e-9) {
    const radians = rotation * Math.PI / 180;
    const cx = destination.x + destination.w / 2;
    const cy = destination.y + destination.h / 2;
    const dx = mappedX - cx;
    const dy = mappedY - cy;
    mappedX = cx + dx * Math.cos(radians) - dy * Math.sin(radians);
    mappedY = cy + dx * Math.sin(radians) + dy * Math.cos(radians);
  }
  return [mappedX, mappedY];
}

function destinationCommands(edit: NativeVectorEdit): NativePathCommand[] {
  const source = edit.sourceBounds;
  const destination = edit.bounds;
  const rotation = finite(edit.rotation);
  const map = (x: number, y: number) => mapDestinationPoint(x, y, source, destination, rotation);
  return edit.commands.map((command) => {
    if (command.op === "Z") return command;
    if (command.op === "C") {
      const p1 = map(command.x1, command.y1);
      const p2 = map(command.x2, command.y2);
      const p3 = map(command.x3, command.y3);
      return { op: "C", x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], x3: p3[0], y3: p3[1] };
    }
    const p = map(command.x, command.y);
    return { op: command.op, x: p[0], y: p[1] };
  });
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = round(value, 5);
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function commandsInSourceSpace(page: PdfPage, record: ParsedVector, commands: NativePathCommand[]): NativePathCommand[] {
  const pageToPdf = pageToPdfMatrix(page);
  const pdfToLocal = inverse(record.ctm);
  return commands.map((command) => transformCommand(transformCommand(command, pageToPdf), pdfToLocal));
}

function pathOperators(commands: NativePathCommand[]): string {
  return commands.map((command) => {
    if (command.op === "Z") return "h";
    if (command.op === "C") return `${formatNumber(command.x1)} ${formatNumber(command.y1)} ${formatNumber(command.x2)} ${formatNumber(command.y2)} ${formatNumber(command.x3)} ${formatNumber(command.y3)} c`;
    return `${formatNumber(command.x)} ${formatNumber(command.y)} ${command.op === "M" ? "m" : "l"}`;
  }).join("\n");
}

function rgb(hex?: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(hex ?? "") ? String(hex).slice(1) : "000000";
  return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255];
}

function resources(pdf: PdfDocument, page: PdfPage, category: string): any {
  const object = page.getObject();
  let root = object.get("Resources");
  if (!root?.isDictionary?.()) {
    const inherited = object.getInheritable?.("Resources");
    root = inherited?.isDictionary?.() ? pdf.graftObject(inherited) : pdf.newDictionary();
    object.put("Resources", root);
  }
  let dictionary = root.get(category);
  if (!dictionary?.isDictionary?.()) {
    dictionary = pdf.newDictionary();
    root.put(category, dictionary);
  }
  return dictionary;
}

function opacityState(pdf: PdfDocument, page: PdfPage, alpha: number): string | undefined {
  if (alpha >= 0.999) return undefined;
  const dictionary = pdf.newDictionary();
  dictionary.put("ca", pdf.newReal(clamp(alpha, 0, 1)));
  dictionary.put("CA", pdf.newReal(clamp(alpha, 0, 1)));
  const name = `LPSVGS${++resourceSequence}`;
  resources(pdf, page, "ExtGState").put(name, pdf.addObject(dictionary));
  return name;
}

function paintOperator(edit: NativeVectorEdit, sourceOperator: ParsedVector["paintOperator"]): ParsedVector["paintOperator"] | "" {
  if (!edit.appearanceOverride) return sourceOperator;
  if (!edit.fillEnabled && !edit.strokeEnabled) return "";
  if (edit.fillEnabled && edit.strokeEnabled) return edit.evenOdd ? "B*" : "B";
  if (edit.fillEnabled) return edit.evenOdd ? "f*" : "f";
  return "S";
}

function appearancePrefix(pdf: PdfDocument, page: PdfPage, edit: NativeVectorEdit): string {
  if (!edit.appearanceOverride) return "";
  const parts = ["q"];
  if (edit.fillEnabled) {
    const [r, g, b] = rgb(edit.fillColor);
    parts.push(`${formatNumber(r)} ${formatNumber(g)} ${formatNumber(b)} rg`);
  }
  if (edit.strokeEnabled) {
    const [r, g, b] = rgb(edit.strokeColor);
    parts.push(`${formatNumber(r)} ${formatNumber(g)} ${formatNumber(b)} RG`);
    const cap = edit.lineCap === "Round" ? 1 : edit.lineCap === "Square" ? 2 : 0;
    const join = edit.lineJoin === "Round" ? 1 : edit.lineJoin === "Bevel" ? 2 : 0;
    parts.push(`${formatNumber(Math.max(0.01, edit.lineWidth))} w`);
    parts.push(`${cap} J`);
    parts.push(`${join} j`);
    parts.push(`${formatNumber(Math.max(1, edit.miterLimit))} M`);
    parts.push(`[${edit.dashPattern.map((value) => formatNumber(Math.max(0, value))).join(" ")}] ${formatNumber(edit.dashPhase)} d`);
  }
  const gs = opacityState(pdf, page, clamp(edit.alpha, 0, 1));
  if (gs) parts.push(`/${gs} gs`);
  return `${parts.join("\n")}\n`;
}

function replacementFor(pdf: PdfDocument, page: PdfPage, record: ParsedVector, edit: NativeVectorEdit): string {
  if (record.object.definesClip) throw new Error(`Vector ${edit.objectId} also defines a clipping path and is protected from direct editing.`);
  if (edit.action === "delete") return "";
  const destination = destinationCommands(edit);
  const local = commandsInSourceSpace(page, record, destination);
  const operator = paintOperator(edit, record.paintOperator);
  const prefix = appearancePrefix(pdf, page, edit);
  const suffix = edit.appearanceOverride ? "\nQ" : "";
  if (!operator) return "";
  return `${prefix}${pathOperators(local)}\n${operator}${suffix}`;
}

function normalizedText(page: PdfPage): string {
  const text = safe(() => page.toStructuredText().asText(), "");
  return String(text).normalize("NFC").replace(/\s+/gu, " ").trim();
}

function imageCount(page: PdfPage): number {
  const structured = safe(() => page.toStructuredText("preserve-images"), null as any);
  if (!structured) return 0;
  try {
    let count = 0;
    structured.walk({ onImageBlock: () => { count += 1; } });
    return count;
  } finally { structured.destroy?.(); }
}

function save(pdf: PdfDocument): Uint8Array {
  const buffer = pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=keep");
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy?.(); }
}

function apply(pdf: PdfDocument, edits: NativeVectorEdit[], requestId: string): { output: Uint8Array; report: NativeExportReport } {
  const startedAt = performance.now();
  const changed = new Set<number>();
  const warnings: string[] = [];
  const before = new Map<number, { text: string; images: number }>();

  for (const pageNumber of [...new Set(edits.map((edit) => edit.pageNumber))]) {
    const page = pdf.loadPage(pageNumber - 1);
    try { before.set(pageNumber, { text: normalizedText(page), images: imageCount(page) }); } finally { page.destroy?.(); }
  }

  for (const edit of edits) {
    active(requestId);
    const page = pdf.loadPage(edit.pageNumber - 1);
    try {
      const match = findRecord(page, edit);
      if (match.record.object.definesClip) throw new Error(`Vector ${edit.objectId} is clip-protected and cannot be edited safely.`);
      const replacement = replacementFor(pdf, page, match.record, edit);
      const next = match.source.slice(0, match.record.start) + replacement + match.source.slice(match.record.end);
      match.stream.writeStream(bytesFromByteString(next));
      changed.add(edit.pageNumber);
      if (match.record.object.clipped) warnings.push(`Vector ${edit.objectId} remains subject to its original clipping boundary.`);
      if (match.record.object.blendMode !== "Normal" && !edit.appearanceOverride) warnings.push(`Vector ${edit.objectId} retains its inherited ${match.record.object.blendMode} blend mode.`);
      if (edit.appearanceOverride && [match.record.object.fillColorSpace, match.record.object.strokeColorSpace].some((space) => space && ["Lab", "Indexed", "Separation", "Unknown"].includes(space))) warnings.push(`Vector ${edit.objectId} appearance override converts the edited path from its complex source color space to DeviceRGB.`);
    } finally { page.destroy?.(); }
  }

  const output = save(pdf);
  const reopened = new (mupdf as any).PDFDocument(output);
  try {
    if (reopened.countPages() !== pdf.countPages()) throw new Error("P4 vector validation failed: page count changed.");
    for (const pageNumber of changed) {
      const page = reopened.loadPage(pageNumber - 1);
      try {
        const snapshot = before.get(pageNumber);
        if (snapshot && normalizedText(page) !== snapshot.text) throw new Error(`P4 vector validation failed: text changed unexpectedly on page ${pageNumber}.`);
        if (snapshot && imageCount(page) !== snapshot.images) throw new Error(`P4 vector validation failed: image count changed unexpectedly on page ${pageNumber}.`);
      } finally { page.destroy?.(); }
    }
    const afterInspection = inspect(reopened, requestId);
    for (const edit of edits) {
      const pageVectors = afterInspection.pages.find((page) => page.pageNumber === edit.pageNumber)?.vectors ?? [];
      if (edit.action === "delete") {
        const stillThere = pageVectors.some((vector) => vector.sourceSignature === edit.sourceSignature && rectDistance(vector.bounds, edit.sourceBounds) < 8);
        if (stillThere) throw new Error(`P4 vector validation failed: deleted source path still exists on page ${edit.pageNumber}.`);
      } else {
        const expected = edit.bounds;
        const candidate = pageVectors.some((vector) => rectDistance(vector.bounds, expected) <= Math.max(18, expected.w * 0.4 + expected.h * 0.4));
        if (!candidate) throw new Error(`P4 vector validation failed: edited path was not found near its destination on page ${edit.pageNumber}.`);
      }
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
        vectorEdits: edits.length,
        tableCellEdits: 0,
        formEdits: 0,
        warnings: [
          "P4 vector edits rewrite only the matched source path operator range; neighboring text, images, and unrelated vector paths are not redacted.",
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
      if (request.type === "INSPECT_VECTORS") {
        self.postMessage({ type: "VECTOR_INSPECTION", requestId: request.requestId, inspection: inspect(pdf, request.requestId) });
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

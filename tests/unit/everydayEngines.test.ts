// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import * as mupdf from "mupdf";
import { createSecurityState } from "../../src/security/securityModel";

// Exercise the actual worker handlers and installed WASM engine, not mocks of
// their successful responses. Browser tests separately cover worker startup.
const handlers: Record<string, (event: { data: any }) => void> = {};
let messages: any[] = [];
beforeAll(async () => {
  const scope: any = { postMessage: (value: any) => messages.push(value) };
  vi.stubGlobal("self", scope);
  await import("../../src/workers/page-operations.worker"); handlers.pages = scope.onmessage;
  await import("../../src/workers/processing.worker"); handlers.processing = scope.onmessage;
  await import("../../src/workers/toolbox.worker"); handlers.toolbox = scope.onmessage;
  await import("../../src/workers/security.worker"); handlers.security = scope.onmessage;
});
afterAll(() => vi.unstubAllGlobals());
function fixture(rotation: 0 | 90 | 180 | 270 = 0, media: [number, number, number, number] = [0, 0, 300, 400]): ArrayBuffer {
  const pdf = new mupdf.PDFDocument(); const font = new mupdf.Font("Helvetica");
  try {
    const embedded = pdf.addSimpleFont(font);
    for (let number = 1; number <= 3; number++) {
      pdf.insertPage(-1, pdf.addPage(media, rotation, { Font: { F1: embedded } }, `BT /F1 20 Tf 40 300 Td (Page ${number}) Tj ET`));
    }
    const buffer = pdf.saveToBuffer();
    try { return Uint8Array.from(buffer.asUint8Array()).buffer; } finally { buffer.destroy(); }
  } finally { font.destroy(); pdf.destroy(); }
}
function execute(engine: string, request: object): any {
  messages = []; handlers[engine]({ data: { requestId: "actual-engine-regression", ...request } });
  expect(messages).toHaveLength(1);
  if (messages[0].error) throw new Error(messages[0].error.message);
  expect(messages[0].output).toBeInstanceOf(ArrayBuffer); return messages[0];
}
function inspect(bytes: ArrayBuffer, password?: string) {
  const pdf = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    if (password) expect(pdf.authenticatePassword(password)).toBeTruthy();
    const pages = [];
    for (let index = 0; index < pdf.countPages(); index++) {
      const page = pdf.loadPage(index);
      try { const text = page.toStructuredText(); try { pages.push({ text: text.asText().trim(), bounds: page.getBounds() }); } finally { text.destroy(); } }
      finally { page.destroy(); }
    }
    return pages;
  } finally { pdf.destroy(); }
}
describe("Real everyday PDF engine exports", () => {
  it("extracts and rotates actual pages without calling nonexistent APIs", () => {
    const result = execute("pages", { type: "COMPILE_PLAN", bytes: fixture(), pages: [{ sourcePageIndex: 2, rotation: 90 }, { sourcePageIndex: 0, rotation: 0 }] });
    expect(inspect(result.output)).toEqual([{ text: "Page 3", bounds: [0, 0, 400, 300] }, { text: "Page 1", bounds: [0, 0, 300, 400] }]);
  });
  it("merges actual files in the requested order", () => {
    const result = execute("pages", { type: "MERGE", sources: [{ name: "a.pdf", bytes: fixture() }, { name: "b.pdf", bytes: fixture() }] });
    expect(inspect(result.output)).toHaveLength(6);
  });
  it("optimizes a genuine PDF without losing selectable text", () => {
    const result = execute("processing", { type: "OPTIMIZE", bytes: fixture() });
    expect(inspect(result.output).map((page) => page.text)).toEqual(["Page 1", "Page 2", "Page 3"]);
  });
  it("writes visible, selectable numbering and watermark text", () => {
    const result = execute("toolbox", { type: "TRANSFORM", bytes: fixture(), options: { decoration: { enabled: true, watermarkText: "DRAFT", headerText: "", footerText: "", pageNumbers: true, startNumber: 8, fontSize: 11, marginPt: 28 } } });
    const pages = inspect(result.output); expect(pages[0].text).toContain("Page 1"); expect(pages[0].text).toContain("DRAFT"); expect(pages[0].text).toContain("8");
  });
  it("crops a PDF by the requested margin", () => {
    const result = execute("toolbox", { type: "TRANSFORM", bytes: fixture(), options: { crop: { enabled: true, topPt: 20, rightPt: 0, bottomPt: 0, leftPt: 0 } } });
    const bounds = inspect(result.output)[0].bounds; expect(bounds[3] - bounds[1]).toBe(380);
  });
  it.each([0, 90, 180, 270] as const)("crops displayed coordinates on rotated and offset pages (%s degrees)", (rotation) => {
    const source = fixture(rotation, [10, 20, 310, 420]);
    const result = execute("toolbox", { type: "TRANSFORM", bytes: source, options: { crop: { enabled: true, topPt: 20, rightPt: 8, bottomPt: 5, leftPt: 12, pageNumbers: [2] } } });
    const pages = inspect(result.output);
    const width = rotation % 180 ? 400 : 300, height = rotation % 180 ? 300 : 400;
    expect(pages[0].bounds).toEqual([0, 0, width, height]);
    expect(pages[1].bounds).toEqual([0, 0, width - 20, height - 25]);
    expect(pages[2].bounds).toEqual(pages[0].bounds);
    // Compare against the engine's documented page-space box setter, not just width/height.
    const expected = mupdf.Document.openDocument(source, "application/pdf");
    const actual = mupdf.Document.openDocument(result.output, "application/pdf");
    const ep = expected.asPDF()!.loadPage(1) as mupdf.PDFPage, ap = actual.asPDF()!.loadPage(1) as mupdf.PDFPage;
    try {
      ep.setPageBox("CropBox", [12, 20, width - 8, height - 5]);
      expect(ap.getObject().get("CropBox").toString()).toBe(ep.getObject().get("CropBox").toString());
    } finally { ep.destroy(); ap.destroy(); expected.destroy(); actual.destroy(); }
  });
  it("rejects oversized or invalid crop margins rather than silently changing them", () => {
    for (const topPt of [-1, 500, NaN, Infinity]) expect(() => execute("toolbox", { type: "TRANSFORM", bytes: fixture(), options: { crop: { enabled: true, topPt, rightPt: 0, bottomPt: 0, leftPt: 0 } } })).toThrow();
  });
  it("assembles native pages from different sources with repeats, blanks and independent rotations", () => {
    const result = execute("pages", { type: "ASSEMBLE", sources: [{ name: "a.pdf", bytes: fixture() }, { name: "b.pdf", bytes: fixture(90) }], pages: [
      { sourceIndex: 1, sourcePageIndex: 2, rotation: 90 },
      { sourceIndex: 0, sourcePageIndex: 0, rotation: 0 },
      { sourceIndex: 0, sourcePageIndex: 0, rotation: 270 },
      { sourceIndex: null, sourcePageIndex: 0, rotation: 0 }
    ] });
    const pages = inspect(result.output);
    expect(pages.map((page) => page.text)).toEqual(["Page 3", "Page 1", "Page 1", ""]);
    expect(pages[0].bounds).toEqual([0, 0, 300, 400]);
    expect(pages[1].bounds).toEqual([0, 0, 300, 400]);
    expect(pages[2].bounds).toEqual([0, 0, 400, 300]);
  });
  it("refuses missing assembly sources and empty plans", () => {
    expect(() => execute("pages", { type: "ASSEMBLE", sources: [], pages: [] })).toThrow();
    expect(() => execute("pages", { type: "ASSEMBLE", sources: [{ name: "a.pdf", bytes: fixture() }], pages: [{ sourceIndex: 4, sourcePageIndex: 0, rotation: 0 }] })).toThrow();
  });
  it("encrypts and unlocks using the exact supplied password", () => {
    const state = createSecurityState("");
    const options = { formUpdates: [], redaction: state.redaction, sanitization: { ...state.sanitization, removeJavaScript: false, removeOpenActions: false, collapseRevisionHistory: false }, encryption: { ...state.encryption, mode: "aes-256", userPassword: "correct-horse-123", ownerPassword: "correct-horse-123" } };
    const encrypted = execute("security", { type: "APPLY_SECURITY", bytes: fixture(), options });
    const pdf = mupdf.Document.openDocument(encrypted.output, "application/pdf");
    try { expect(pdf.needsPassword()).toBe(true); expect(pdf.authenticatePassword("wrong")).toBe(0); } finally { pdf.destroy(); }
    expect(inspect(encrypted.output, "correct-horse-123")).toHaveLength(3);
    const unlocked = execute("security", { type: "APPLY_SECURITY", bytes: encrypted.output, password: "correct-horse-123", options: { ...options, encryption: { ...options.encryption, mode: "remove" } } });
    expect(inspect(unlocked.output).map((page) => page.text)).toEqual(["Page 1", "Page 2", "Page 3"]);
  });
});

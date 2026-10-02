import { afterEach, describe, expect, it, vi } from "vitest";
import fileHandoffSource from "../../src/product/fileHandoff.ts?raw";
import { discardTaskFiles, handOffTaskFiles, inspectIncomingFiles, takeTaskFiles, takeTaskTransfer } from "../../src/product/fileHandoff";
const pdf = (name = "report.pdf") => new File(["%PDF-test"], name, { type: "application/pdf" });
afterEach(() => { discardTaskFiles(); vi.useRealTimers(); });
describe("task-first file entry", () => {
  it("recognizes a single PDF without parsing or storing its contents", () => expect(inspectIncomingFiles([pdf()])).toBe("pdf"));
  it("recognizes several PDFs including uppercase extensions", () => expect(inspectIncomingFiles([pdf(), pdf("SECOND.PDF")])).toBe("pdfs"));
  it("recognizes supported mixed image formats", () => expect(inspectIncomingFiles([new File(["a"], "photo.JPG"), new File(["b"], "scan.webp"), new File(["c"], "page.png")])).toBe("images"));
  it("rejects no files", () => expect(() => inspectIncomingFiles([])).toThrow("Choose at least one"));
  it("rejects empty files", () => expect(() => inspectIncomingFiles([new File([], "empty.pdf")])).toThrow("empty"));
  it("accepts mixed PDFs and images for direct assembly", () => expect(inspectIncomingFiles([pdf(), new File(["a"], "image.jpg")])).toBe("mixed"));
  it("does not pretend Office conversion exists", () => expect(() => inspectIncomingFiles([new File(["a"], "document.docx")])).toThrow("not implemented"));
  it("rejects a batch above the memory budget before opening it", () => {
    const file = pdf(); Object.defineProperty(file, "size", { value: 201 * 1024 * 1024 });
    expect(() => inspectIncomingFiles([file])).toThrow("200 MB");
  });
});
describe("one-use file handoff", () => {
  it("preserves the actual files and ordering", () => {
    const first = pdf("one.pdf"), second = pdf("two.pdf"); handOffTaskFiles("merge-pdfs", [first, second]);
    expect(takeTaskFiles("merge-pdfs")).toEqual([first, second]); expect(takeTaskFiles("merge-pdfs")).toBeNull();
  });
  it("does not leak files to a different task", () => {
    handOffTaskFiles("extract-pages", [pdf()]); expect(takeTaskFiles("compress-pdf")).toBeNull(); expect(takeTaskFiles("extract-pages")).toHaveLength(1); expect(takeTaskFiles("extract-pages")).toBeNull();
  });
  it("expires abandoned handoffs", () => {
    vi.useFakeTimers(); handOffTaskFiles("extract-pages", [pdf()]); vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(takeTaskFiles("extract-pages")).toBeNull();
  });
  it("actively releases abandoned transfer references when the TTL elapses", () => {
    expect(fileHandoffSource).toContain("pendingExpiry = setTimeout");
    expect(fileHandoffSource).toContain("if (pending !== transfer) return");
    expect(fileHandoffSource).toContain("clearTimeout(pendingExpiry)");
  });
  it("copies the caller's array so later mutations do not change the batch", () => {
    const first = pdf(); const files = [first]; handOffTaskFiles("merge-pdfs", files); files.push(pdf("later.pdf"));
    expect(takeTaskFiles("merge-pdfs")).toEqual([first]);
  });
  it("can release file references explicitly", () => { handOffTaskFiles("extract-pages", [pdf()]); discardTaskFiles(); expect(takeTaskFiles("extract-pages")).toBeNull(); });
});


describe("Mobile files and handoff recovery", () => {
  it("accepts extensionless PDF and image files with supported MIME types", () => {
    expect(inspectIncomingFiles([pdf("shared-file")])).toBe("pdf");
    expect(inspectIncomingFiles([new File(["image"], "camera", { type: "image/jpeg" })])).toBe("images");
  });
  it("routes a batch of images directly into scanning", () => {
    const files = [new File(["scan"], "camera.jpg")]; handOffTaskFiles("scan-to-pdf", files);
    expect(takeTaskTransfer("scan-to-pdf")?.files).toEqual(files);
  });
  it("keeps per-file passwords aligned and insulated from caller mutations", () => {
    const passwords = ["first", "second"]; const warnings = ["Review forms"];
    handOffTaskFiles("merge-pdfs", [pdf("first.pdf"), pdf("second.pdf")], { passwords, warnings });
    passwords.reverse(); warnings.push("not in transfer");
    expect(takeTaskTransfer("merge-pdfs")).toMatchObject({ passwords: ["first", "second"], warnings: ["Review forms"] });
  });
});

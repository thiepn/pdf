import { afterEach, describe, expect, it, vi } from "vitest";
import { discardTaskFiles, handOffTaskFiles, inspectIncomingFiles, takeTaskFiles } from "../../src/product/fileHandoff";
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
  it("copies the caller's array so later mutations do not change the batch", () => {
    const first = pdf(); const files = [first]; handOffTaskFiles("merge-pdfs", files); files.push(pdf("later.pdf"));
    expect(takeTaskFiles("merge-pdfs")).toEqual([first]);
  });
  it("can release file references explicitly", () => { handOffTaskFiles("extract-pages", [pdf()]); discardTaskFiles(); expect(takeTaskFiles("extract-pages")).toBeNull(); });
});

import { describe, expect, it } from "vitest";
import { defaultQuickOptions, formatBytes, handOffQuickResult, isQuickTask, parsePageSelection, planSplit, quickTaskIds, safeOutputName, takeQuickResult } from "../../src/quick/quickModel";
import { getTask, pdfTasks, taskRoute } from "../../src/ia/taskCatalog";
import { readAppRoute, routeHref } from "../../src/core/appRouter";
import { rankTasksByQuery } from "../../src/ia/taskSearch";
describe("Everyday PDF page selection", () => {
  it.each([
    ["all", 5, [0, 1, 2, 3, 4]], ["odd", 5, [0, 2, 4]], ["even", 5, [1, 3]],
    ["1-3, 5, 8-end", 10, [0, 1, 2, 4, 7, 8, 9]], ["3-1", 5, [2, 1, 0]],
    ["2, 2, 1-3", 5, [1, 0, 2]], ["1–3", 5, [0, 1, 2]], ["last-3", 5, [4, 3, 2]], ["  ODD, end ", 6, [0, 2, 4, 5]]
  ])("parses %s without changing requested order", (input, count, expected) => { expect(parsePageSelection(String(input), Number(count))).toEqual(expected); });
  it.each(["", " ", "0", "-1", "1.5", "6", "1-6", "1,", "1,,2", "2-x", "1e1", "NaN", "Infinity"])("rejects invalid selection %s", (value) => { expect(() => parsePageSelection(value, 5)).toThrow(); });
  it("rejects a selection with no matching pages", () => { expect(() => parsePageSelection("even", 1)).toThrow(/No pages/); });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid document page count %s", (count) => { expect(() => parsePageSelection("all", count)).toThrow(); });
  it("splits into individual pages by default", () => { expect(planSplit(3, "each", 8, "")).toEqual([[0], [1], [2]]); });
  it("retains the last partial chunk", () => { expect(planSplit(5, "every", 2, "")).toEqual([[0, 1], [2, 3], [4]]); });
  it("preserves custom group order and allows overlapping groups", () => { expect(planSplit(5, "ranges", 1, "3-1; 1,5; 2-end")).toEqual([[2, 1, 0], [0, 4], [1, 2, 3, 4]]); });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid chunk size %s", (size) => { expect(() => planSplit(5, "every", size, "")).toThrow(); });
  it.each(["", "1-2;", ";1-2", "1-2;;3", "1-9"])("rejects invalid custom groups %s", (value) => { expect(() => planSplit(5, "ranges", 1, value)).toThrow(); });
});
describe("Everyday task routing and discovery", () => {
  it.each(quickTaskIds)("routes %s directly to a real workflow", (id) => {
    const task = getTask(id)!; expect(task).toBeDefined(); expect(task.audience).toBe("everyday"); expect(isQuickTask(id)).toBe(true);
    const route = taskRoute(task)!; expect(route).toEqual({ name: "quick", taskId: id }); expect(readAppRoute(routeHref(route))).toEqual(route);
    const withProject = taskRoute(task, "a/b with spaces")!; expect(readAppRoute(routeHref(withProject))).toEqual(withProject);
  });
  it("does not route unsupported converters to a fake result", () => { for (const id of ["pdf-to-word", "word-to-pdf", "pdf-to-excel", "pdf-to-powerpoint"]) expect(isQuickTask(id)).toBe(false); });
  it.each([
    ["remove pages", "remove-pages"], ["extract pages 2 through 4", "extract-pages"], ["rotate pages", "rotate-pdf"],
    ["JPG to PDF", "images-to-pdf"], ["PDF to JPG", "pdf-to-jpg"], ["PDF to PNG", "pdf-to-png"], ["PDF to text", "pdf-to-text"],
    ["remove password", "unlock-pdf"], ["add page numbers", "add-page-numbers"], ["add watermark", "add-watermark"]
  ])("finds %s before unrelated or broad tools", (query, id) => { expect(rankTasksByQuery(pdfTasks, query)[0].id).toBe(id); });
  it("retains legacy document deep links", () => { expect(readAppRoute("#/workspace/old-project/toolbox/split-pdf")).toEqual({ name: "workspace", projectId: "old-project", mode: "toolbox", taskId: "split-pdf" }); });
  it("has unique task IDs", () => { expect(new Set(pdfTasks.map((task) => task.id)).size).toBe(pdfTasks.length); });
});
describe("Temporary quick-file state", () => {
  it("creates independent safe defaults", () => { const first = defaultQuickOptions(); const second = defaultQuickOptions(); first.crop.top = 20; expect(second.crop.top).toBe(0); expect(second.compression).toBe("lossless"); expect(second.acceptRaster).toBe(false); });
  it("consumes a chained result only once", () => { const file = new File(["test"], "example.pdf", { type: "application/pdf" }); handOffQuickResult("extract-pages", file); expect(takeQuickResult("extract-pages")).toBe(file); expect(takeQuickResult("extract-pages")).toBeNull(); });
  it("does not leak a result into a different task", () => { handOffQuickResult("extract-pages", new File(["test"], "example.pdf")); expect(takeQuickResult("rotate-pdf")).toBeNull(); expect(takeQuickResult("extract-pages")).toBeNull(); });
  it("normalizes output extensions and unsafe path characters", () => { expect(safeOutputName(" report.pdf ", "zip")).toBe("report.zip"); expect(safeOutputName("../a/b\\c?.png", "pdf")).toBe("..-a-b-c-.pdf"); expect(safeOutputName("...", "pdf")).toBe("document.pdf"); expect(safeOutputName("", "pdf")).toBe("document.pdf"); });
  it("reports file sizes without inventing compression ratios", () => { expect(formatBytes(512)).toBe("512 B"); expect(formatBytes(1024)).toBe("1.0 KB"); expect(formatBytes(1024 * 1024)).toBe("1.0 MB"); });
});

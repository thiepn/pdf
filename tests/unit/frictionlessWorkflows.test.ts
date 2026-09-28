import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptsTaskInput, discardTaskFiles, handOffTaskFiles, takeTaskTransfer } from "../../src/product/fileHandoff";
import { getTask } from "../../src/ia/taskCatalog";
import { createAssemblyPlan, interleaveAssembly, MAX_ASSEMBLY_PAGES, moveAssemblyPage, validateAssemblyPlan } from "../../src/quick/assemblyModel";
const inputs = [{ id: "front", pageCount: 3 }, { id: "back", pageCount: 2 }];
afterEach(() => { discardTaskFiles(); vi.useRealTimers(); });
describe("Applicable tools have usable file handoffs", () => {
  it("offers merge, composition and comparison for two PDFs", () => {
    for (const id of ["merge-pdfs", "organize-pages", "compare-pdfs", "compress-pdf"]) expect(acceptsTaskInput(getTask(id)!, "pdfs", 2)).toBe(true);
    expect(acceptsTaskInput(getTask("compare-pdfs")!, "pdfs", 3)).toBe(false);
    expect(acceptsTaskInput(getTask("extract-pages")!, "pdfs", 2)).toBe(false);
  });
  it("offers mixed assembly without misadvertising single-document tools", () => {
    expect(acceptsTaskInput(getTask("merge-pdfs")!, "mixed", 2)).toBe(true);
    expect(acceptsTaskInput(getTask("organize-pages")!, "mixed", 2)).toBe(true);
    expect(acceptsTaskInput(getTask("compare-pdfs")!, "mixed", 2)).toBe(false);
    expect(acceptsTaskInput(getTask("images-to-pdf")!, "mixed", 2)).toBe(false);
  });
  it("keeps passwords/warnings only in the one-use in-memory transfer", () => {
    const file = new File(["pdf"], "edited.pdf");
    handOffTaskFiles("compress-pdf", [file], { passwords: ["session-only"], warnings: ["An existing signature is invalidated by edits."] });
    expect(takeTaskTransfer("compare-pdfs")).toBeNull();
    expect(takeTaskTransfer("compress-pdf")).toEqual({ files: [file], passwords: ["session-only"], warnings: ["An existing signature is invalidated by edits."] });
    expect(takeTaskTransfer("compress-pdf")).toBeNull();
  });
  it("rejects incompatible, unknown and oversized transfers", () => {
    expect(() => handOffTaskFiles("compare-pdfs", [new File(["img"], "image.png")])).toThrow();
    expect(() => handOffTaskFiles("invented-tool", [new File(["pdf"], "a.pdf")])).toThrow();
  });
});
describe("Visual assembly planning", () => {
  it("preserves source sequence with unique output identities", () => {
    const plan = createAssemblyPlan(inputs); expect(plan).toHaveLength(5); expect(new Set(plan.map((page) => page.id)).size).toBe(5);
    expect(plan.map((page) => `${page.sourceId}:${page.sourcePageIndex}`)).toEqual(["front:0", "front:1", "front:2", "back:0", "back:1"]);
    expect(() => validateAssemblyPlan(plan, inputs)).not.toThrow();
  });
  it("moves without mutating undo history", () => { const plan = createAssemblyPlan(inputs); const moved = moveAssemblyPage(plan, 4, 0); expect(moved[0].id).toBe(plan[4].id); expect(plan[0].sourceId).toBe("front"); });
  it("interleaves unequal scans without dropping a final page", () => { expect(interleaveAssembly(inputs).map((page) => `${page.sourceId}:${page.sourcePageIndex}`)).toEqual(["front:0", "back:0", "front:1", "back:1", "front:2"]); });
  it("reverses only the backs before interleaving", () => { expect(interleaveAssembly(inputs, true).map((page) => `${page.sourceId}:${page.sourcePageIndex}`)).toEqual(["front:0", "back:1", "front:1", "back:0", "front:2"]); });
  it("validates missing sources, duplicate identities, rotations and limits", () => {
    const plan = createAssemblyPlan(inputs);
    expect(() => validateAssemblyPlan([], inputs)).toThrow();
    expect(() => validateAssemblyPlan([plan[0], plan[0]], inputs)).toThrow();
    expect(() => validateAssemblyPlan([{ ...plan[0], sourceId: "missing" }], inputs)).toThrow();
    expect(() => validateAssemblyPlan([{ ...plan[0], sourcePageIndex: 99 }], inputs)).toThrow();
    expect(() => createAssemblyPlan([{ id: "huge", pageCount: MAX_ASSEMBLY_PAGES + 1 }])).toThrow();
  });
});

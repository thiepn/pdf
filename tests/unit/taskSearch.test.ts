import { describe, expect, it } from "vitest";
import { pdfTasks } from "../../src/ia/taskCatalog";
import { rankTasksByQuery, taskMatchesQuery } from "../../src/ia/taskSearch";

const cases: Array<[string, string]> = [
  ["change existing text", "edit-pdf"],
  ["add new text", "edit-pdf"],
  ["replace an image", "edit-pdf"],
  ["highlight some text", "annotate-pdf"],
  ["sign this document visually", "visual-signature"],
  ["permanently hide this account number", "apply-redactions"],
  ["combine two PDFs", "merge-pdfs"],
  ["split this PDF into parts", "split-pdf"],
  ["extract pages 4 through 7", "organize-pages"],
  ["remove pages 4 through 7", "organize-pages"],
  ["move pages into a new order", "organize-pages"],
  ["rotate pages", "organize-pages"],
  ["trim page margins", "crop-pages"],
  ["make this PDF smaller", "compress-pdf"],
  ["make this scan searchable", "ocr-pdf"],
  ["remove document metadata", "metadata"],
  ["lock this PDF with a password", "password-protect"],
  ["fill this form", "fill-forms"],
  ["turn photos into a PDF", "scan-to-pdf"],
  ["export PDF pages as images", "export-content"]
];

describe("R8 natural-language task discovery", () => {
  it.each(cases)("ranks %s first as %s", (query, taskId) => {
    const matches = rankTasksByQuery(pdfTasks.filter((candidate) => candidate.audience !== "recovery"), query);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.id).toBe(taskId);
  });

  it("meets the frozen top-20 first-result target", () => {
    const passing = cases.filter(([query, taskId]) => {
      const first = rankTasksByQuery(pdfTasks.filter((candidate) => candidate.audience !== "recovery"), query)[0];
      return first?.id === taskId;
    }).length;
    expect(passing / cases.length).toBeGreaterThanOrEqual(0.9);
  });

  it("does not turn unrelated phrases into universal matches", () => {
    const compress = pdfTasks.find((candidate) => candidate.id === "compress-pdf")!;
    expect(taskMatchesQuery(compress, "fill this form")).toBe(false);
  });
});

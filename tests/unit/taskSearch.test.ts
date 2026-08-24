import { describe, expect, it } from "vitest";
import { pdfTasks } from "../../src/ia/taskCatalog";
import { taskMatchesQuery } from "../../src/ia/taskSearch";

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
  it.each(cases)("matches %s to %s", (query, taskId) => {
    const task = pdfTasks.find((candidate) => candidate.id === taskId);
    expect(task).toBeDefined();
    expect(taskMatchesQuery(task!, query)).toBe(true);
  });

  it("does not turn unrelated phrases into universal matches", () => {
    const compress = pdfTasks.find((candidate) => candidate.id === "compress-pdf")!;
    expect(taskMatchesQuery(compress, "fill this form")).toBe(false);
  });
});

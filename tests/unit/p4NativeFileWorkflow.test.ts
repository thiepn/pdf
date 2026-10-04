import { describe, expect, it } from "vitest";
import { safeNativeBackupName, safeNativePdfName } from "../../src/files/nativeFileWorkflow";
import fs from "node:fs";

describe("P4 native file workflow", () => {
  it("normalizes PDF and project backup filenames without path separators", () => {
    expect(safeNativePdfName("Quarter/Review")).toBe("Quarter-Review.pdf");
    expect(safeNativePdfName("report.PDF")).toBe("report.PDF");
    expect(safeNativeBackupName("Client:Archive")).toBe("Client-Archive.lpsproject");
  });

  it("keeps source replacement explicit in the product wiring", () => {
    const editor = fs.readFileSync(new URL("../../src/views/EditorPage.tsx", import.meta.url), "utf8");
    const home = fs.readFileSync(new URL("../../src/views/HomePage.tsx", import.meta.url), "utf8");
    expect(home).toContain("openNativePdf");
    expect(home).toContain("rememberNativeSourceHandle");
    expect(editor).toContain("savePdfToNativeTarget");
    expect(editor).toContain("savePdfAsNative");
    expect(editor).toContain("replaceNativeSource");
    expect(editor).toContain("Replace original");
  });

  it("keeps native handles outside the project manifest schema", () => {
    const projectTypes = fs.readFileSync(new URL("../../src/types/project.ts", import.meta.url), "utf8");
    expect(projectTypes).not.toContain("FileSystemFileHandle");
    expect(projectTypes).not.toContain("NativeFileHandle");
  });
});

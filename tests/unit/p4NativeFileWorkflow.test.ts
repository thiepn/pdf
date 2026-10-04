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
    expect(editor).toContain("prepareNativePdfWrite");
    expect(editor).toContain("commitPreparedNativePdfWrite");
    expect(editor).toContain("Replace original");
  });

  it("acquires native targets before the expensive export operation", () => {
    const editor = fs.readFileSync(new URL("../../src/views/EditorPage.tsx", import.meta.url), "utf8");
    const exportBody = editor.slice(editor.indexOf("async function exportPdf"));
    expect(exportBody.indexOf("prepareNativePdfWrite")).toBeGreaterThanOrEqual(0);
    expect(exportBody.indexOf("prepareNativePdfWrite")).toBeLessThan(exportBody.indexOf("runProjectOperation(project.id"));
  });

  it("persists opaque handles outside the project/package schema", () => {
    const projectTypes = fs.readFileSync(new URL("../../src/types/project.ts", import.meta.url), "utf8");
    const database = fs.readFileSync(new URL("../../src/storage/database.ts", import.meta.url), "utf8");
    expect(projectTypes).not.toContain("FileSystemFileHandle");
    expect(projectTypes).not.toContain("NativeFileHandle");
    expect(database).toContain('"nativeFileBindings"');
    expect(database).toContain("DB_VERSION = 14");
  });

  it("keeps automatic backup permission-prompt free after save", () => {
    const editor = fs.readFileSync(new URL("../../src/views/EditorPage.tsx", import.meta.url), "utf8");
    expect(editor).toContain("writeExternalProjectBackup(project.id, backup");
    expect(editor).not.toContain("writeExternalProjectBackup(project.id, backup, \`${safeName(backupProject.name)}.lpsproject\`, { requestPermission: true })");
  });
});

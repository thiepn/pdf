import { describe, expect, it } from "vitest";
import { safeNativeBackupName, safeNativePdfName } from "../../src/files/nativeFileWorkflow";
import editorSource from "../../src/views/EditorPage.tsx?raw";
import homeSource from "../../src/views/HomePage.tsx?raw";
import projectTypesSource from "../../src/types/project.ts?raw";
import databaseSource from "../../src/storage/database.ts?raw";

describe("P4 native file workflow", () => {
  it("normalizes PDF and project backup filenames without path separators", () => {
    expect(safeNativePdfName("Quarter/Review")).toBe("Quarter-Review.pdf");
    expect(safeNativePdfName("report.PDF")).toBe("report.PDF");
    expect(safeNativeBackupName("Client:Archive")).toBe("Client-Archive.lpsproject");
  });

  it("keeps source replacement explicit in the product wiring", () => {
    expect(homeSource).toContain("openNativePdf");
    expect(homeSource).toContain("rememberNativeSourceHandle");
    expect(editorSource).toContain("prepareNativePdfWrite");
    expect(editorSource).toContain("commitPreparedNativePdfWrite");
    expect(editorSource).toContain("Replace original");
  });

  it("acquires native targets before the expensive export operation", () => {
    const exportBody = editorSource.slice(editorSource.indexOf("async function exportPdf"));
    expect(exportBody.indexOf("prepareNativePdfWrite")).toBeGreaterThanOrEqual(0);
    expect(exportBody.indexOf("prepareNativePdfWrite")).toBeLessThan(exportBody.indexOf("runProjectOperation(project.id"));
  });

  it("persists opaque handles outside the project/package schema", () => {
    expect(projectTypesSource).not.toContain("FileSystemFileHandle");
    expect(projectTypesSource).not.toContain("NativeFileHandle");
    expect(databaseSource).toContain('"nativeFileBindings"');
    expect(databaseSource).toContain("DB_VERSION = 14");
  });

  it("keeps automatic backup permission-prompt free after save", () => {
    expect(editorSource).toContain("writeExternalProjectBackup(project.id, backup");
    expect(editorSource).not.toContain("writeExternalProjectBackup(project.id, backup, \`${safeName(backupProject.name)}.lpsproject\`, { requestPermission: true })");
  });
});

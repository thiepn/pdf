import { describe, expect, it } from "vitest";
import { safeNativeBackupName, safeNativePdfName, supportsNativeDirectoryBackup, supportsNativeFileOpen, supportsNativeFileSave } from "../../src/files/nativeFileWorkflow";
import editorSource from "../../src/views/EditorPage.tsx?raw";
import homeSource from "../../src/views/HomePage.tsx?raw";
import projectTypesSource from "../../src/types/project.ts?raw";
import databaseSource from "../../src/storage/database.ts?raw";
import nativeWorkflowSource from "../../src/files/nativeFileWorkflow.ts?raw";

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

  it("persists opaque handles outside the frozen project/package schema", () => {
    expect(projectTypesSource).not.toContain("FileSystemFileHandle");
    expect(projectTypesSource).not.toContain("NativeFileHandle");
    expect(databaseSource).not.toContain('"nativeFileBindings"');
    expect(databaseSource).toContain("DB_VERSION = 13");
    expect(nativeWorkflowSource).toContain('NATIVE_FILE_DB_NAME = "local-pdf-studio-native-files"');
    expect(nativeWorkflowSource).toContain("NATIVE_FILE_DB_VERSION = 1");
  });

  it("detects native picker capabilities progressively", () => {
    const host = window as unknown as Record<string, unknown>;
    const keys = ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"] as const;
    const previous = keys.map((key) => [key, host[key]] as const);
    try {
      for (const key of keys) host[key] = () => Promise.resolve([]);
      expect(supportsNativeFileOpen()).toBe(true);
      expect(supportsNativeFileSave()).toBe(true);
      expect(supportsNativeDirectoryBackup()).toBe(true);
      for (const key of keys) delete host[key];
      expect(supportsNativeFileOpen()).toBe(false);
      expect(supportsNativeFileSave()).toBe(false);
      expect(supportsNativeDirectoryBackup()).toBe(false);
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete host[key];
        else host[key] = value;
      }
    }
  });

  it("guards against Save targeting the linked original and render-time file changes", () => {
    expect(nativeWorkflowSource).toContain("isSameEntry");
    expect(nativeWorkflowSource).toContain("Save as cannot replace the original PDF");
    expect(nativeWorkflowSource).toContain("expectedLastModified");
    expect(nativeWorkflowSource).toContain("await assertExternalFileUnchanged(prepared.handle");
    expect(nativeWorkflowSource).toContain("writable.abort?.(reason)");
  });

  it("keeps automatic backup permission-prompt free after save", () => {
    expect(editorSource).toContain("writeExternalProjectBackup(project.id, backup");
    expect(editorSource).not.toContain("writeExternalProjectBackup(project.id, backup, \`${safeName(backupProject.name)}.lpsproject\`, { requestPermission: true })");
  });
});

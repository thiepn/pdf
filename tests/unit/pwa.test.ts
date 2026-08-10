import { describe, expect, it } from "vitest";
import { classifyIncomingFile } from "../../src/pwa/fileIngress";

describe("PWA file ingress", () => {
  it("classifies PDFs and PDF Studio project packages", () => {
    expect(classifyIncomingFile("report.pdf")).toBe("pdf");
    expect(classifyIncomingFile("backup.lpsproject")).toBe("package");
    expect(classifyIncomingFile("no-extension", "application/pdf")).toBe("pdf");
  });

  it("rejects unrelated shared/opened files", () => {
    expect(classifyIncomingFile("photo.png", "image/png")).toBeNull();
  });
});

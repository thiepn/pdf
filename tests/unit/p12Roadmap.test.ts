import { describe, expect, it } from "vitest";
import intakeSource from "../../docs/p12/feature-intake.json?raw";
import p12Doc from "../../docs/product/P12_V72_PRODUCT_ROADMAP.md?raw";
import p11Source from "../../docs/p11/next-line.json?raw";
import packageSource from "../../package.json?raw";
import lockSource from "../../package-lock.json?raw";
import releaseSource from "../../src/core/release.ts?raw";
import p3Doc from "../../docs/product/P3_OCR_SCAN_TO_EDITABLE.md?raw";
import readme from "../../README.md?raw";

const intake = JSON.parse(intakeSource);
const p11 = JSON.parse(p11Source);
const pkg = JSON.parse(packageSource);
const lock = JSON.parse(lockSource);

describe("P12 v7.2 product roadmap and feature intake", () => {
  it("keeps v7.2 scoped but pre-cut", () => {
    expect(intake).toMatchObject({
      schemaVersion: 2,
      phase: "P12",
      roadmap: "v7.2-product-roadmap",
      status: "scoped-pre-cut",
      parentPhase: "P11",
      releaseBoundary: {
        currentExecutableVersion: "7.1.4",
        targetVersion: "7.2.0",
        versionCutAllowed: false
      }
    });
    expect(p11.status).toBe("pre-cut");
    expect(pkg.version).toBe("7.1.4");
    expect(lock.version).toBe("7.1.4");
    expect(releaseSource).toContain('APP_VERSION = "7.1.4"');
  });

  it("does not re-plan capabilities already shipped in v7.1", () => {
    const shipped = Object.fromEntries(intake.baseline.alreadyShipped.map((item: { id: string; capability: string }) => [item.id, item.capability]));
    expect(shipped["SHIPPED-P3-OCR2"]).toContain("invisible searchable text");
    expect(shipped["SHIPPED-V71-PAGE-COMPOSITION"]).toContain("duplex interleaving");
    expect(shipped["SHIPPED-P8-FIDELITY"]).toContain("fidelity");
    expect(p3Doc).toContain("adds invisible positioned text");
    expect(readme).toContain("Visual mixed PDF/image assembly");
    expect(intake.items.some((item: { title: string }) => item.title === "Visual page composition")).toBe(false);
    expect(intake.items.some((item: { title: string }) => item.title === "Original-page OCR fidelity")).toBe(false);
  });

  it("commits exactly the bounded net-new v7.2 outcome set", () => {
    const committed = intake.items.filter((item: { disposition: string }) => item.disposition === "committed");
    expect(committed.map((item: { id: string }) => item.id)).toEqual(intake.committedRoadmapOrder);
    expect(committed.map((item: { title: string }) => item.title)).toEqual([
      "Layout-aware editable PDF to DOCX export",
      "Complex-script existing-text editing",
      "Structure-preserving target-size compression",
      "Batch parity and encrypted-queue ergonomics",
      "Deep native-content fidelity",
      "Compatibility and human/device qualification"
    ]);
    expect(committed.every((item: { evidence: string[]; acceptance: string[] }) => item.evidence.length > 0 && item.acceptance.length >= 5)).toBe(true);
  });

  it("keeps high-risk expansion outside committed scope", () => {
    const disposition = Object.fromEntries(intake.items.map((item: { id: string; disposition: string }) => [item.id, item.disposition]));
    expect(disposition["V72-C1"]).toBe("candidate");
    expect(disposition["V72-C2"]).toBe("candidate");
    expect(disposition["V72-D1"]).toBe("deferred");
    expect(disposition["V72-D2"]).toBe("deferred");
    expect(p12Doc).toContain("bidirectional XLSX/PPTX conversion");
    expect(p12Doc).toContain("PAdES signing");
  });

  it("forbids release/schema drift during feature intake", () => {
    expect(intake.intakeRules.versionCutForbiddenInP12).toBe(true);
    expect(intake.intakeRules.persistentFormatChangeForbiddenInP12).toBe(true);
    expect(intake.releaseBoundary.persistentFormats).toEqual({
      projectPackageVersion: 9,
      databaseSchemaVersion: 13,
      nativeEditorSchemaVersion: 6
    });
    expect(intake.items.filter((item: { disposition: string }) => item.disposition === "committed").every((item: { schemaChange: boolean }) => item.schemaChange === false)).toBe(true);
  });

  it("hands the roadmap to P13 layout-aware DOCX export", () => {
    expect(intake.nextPhase).toEqual({
      id: "P13",
      title: "Layout-Aware PDF to DOCX Export 2.0",
      roadmapItem: "V72-01"
    });
    expect(p12Doc).toContain("P13 — Layout-Aware PDF → DOCX Export 2.0");
  });
});

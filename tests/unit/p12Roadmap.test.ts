import { describe, expect, it } from "vitest";
import intakeSource from "../../docs/p12/feature-intake.json?raw";
import p12Doc from "../../docs/product/P12_V72_PRODUCT_ROADMAP.md?raw";
import p11Source from "../../docs/p11/next-line.json?raw";
import packageSource from "../../package.json?raw";
import lockSource from "../../package-lock.json?raw";
import releaseSource from "../../src/core/release.ts?raw";

const intake = JSON.parse(intakeSource);
const p11 = JSON.parse(p11Source);
const pkg = JSON.parse(packageSource);
const lock = JSON.parse(lockSource);

describe("P12 v7.2 product roadmap and feature intake", () => {
  it("keeps v7.2 scoped but pre-cut", () => {
    expect(intake).toMatchObject({
      schemaVersion: 1,
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

  it("commits exactly the bounded v7.2 outcome set", () => {
    const committed = intake.items.filter((item: { disposition: string }) => item.disposition === "committed");
    expect(committed.map((item: { id: string }) => item.id)).toEqual(intake.committedRoadmapOrder);
    expect(intake.committedRoadmapOrder).toEqual(["V72-01","V72-02","V72-03","V72-04","V72-05","V72-06"]);
    expect(committed.every((item: { evidence: string[]; acceptance: string[] }) => item.evidence.length > 0 && item.acceptance.length >= 3)).toBe(true);
  });

  it("keeps high-risk capabilities outside committed scope", () => {
    const disposition = Object.fromEntries(intake.items.map((item: { id: string; disposition: string }) => [item.id, item.disposition]));
    expect(disposition["V72-C1"]).toBe("candidate");
    expect(disposition["V72-C2"]).toBe("candidate");
    expect(disposition["V72-D1"]).toBe("deferred");
    expect(disposition["V72-D2"]).toBe("deferred");
    expect(p12Doc).toContain("full bidirectional DOCX/XLSX/PPTX conversion");
    expect(p12Doc).toContain("browser certificate-store/PAdES signing");
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

  it("hands the roadmap to P13 visual page composition", () => {
    expect(intake.nextPhase).toEqual({
      id: "P13",
      title: "Visual Page Composition & Page Surgery UX",
      roadmapItem: "V72-01"
    });
    expect(p12Doc).toContain("P13 — Visual Page Composition & Page Surgery UX");
  });
});

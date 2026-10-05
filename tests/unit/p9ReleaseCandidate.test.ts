import { describe, expect, it } from "vitest";
import freezeSource from "../../docs/p9/release-freeze.json?raw";
import p9Source from "../../docs/P9_RELEASE_CANDIDATE.md?raw";
import releaseNotes from "../../docs/releases/v7.1.4/release-notes.md?raw";
import releaseWorkflow from "../../.github/workflows/release.yml?raw";
import completionWorkflow from "../../.github/workflows/release-completion.yml?raw";
import auditSource from "../../scripts/p9/release-candidate-audit.mjs?raw";
import releaseSource from "../../src/core/release.ts?raw";

const freeze = JSON.parse(freezeSource) as {
  schemaVersion: number;
  version: string;
  channel: string;
  stableTag: string;
  roadmap: string;
  phaseDocs: Record<string, string>;
  releaseNotes: string;
  certificateArtifact: string;
  certification: string;
};

describe("P9 release candidate certification", () => {
  it("freezes the current task-first P1-P8 roadmap instead of the stale editing phase map", () => {
    expect(freeze).toMatchObject({
      schemaVersion: 2,
      version: "7.1.4",
      channel: "release-candidate",
      stableTag: "v7.1.4",
      roadmap: "task-first-product-hardening",
      certification: "pending-ci"
    });
    expect(Object.keys(freeze.phaseDocs)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
    expect(freeze.phaseDocs.P4).toContain("P4_NATIVE_FILE_WORKFLOW");
    expect(freeze.phaseDocs.P5).toContain("P5_TRUST_OUTPUT_VERIFICATION");
    expect(freeze.phaseDocs.P6).toContain("P6_MOBILE_INTERACTION_EXCELLENCE");
    expect(freeze.phaseDocs.P7).toContain("P7_FORMS_REDACTION_EXCELLENCE");
    expect(freeze.phaseDocs.P8).toContain("P8_FIDELITY_COMPATIBILITY");
  });

  it("keeps source certification pending and delegates proof to exact-head CI evidence", () => {
    expect(p9Source).toContain("V7_1_4_RC_CERTIFIED");
    expect(p9Source).toContain("exact candidate head");
    expect(p9Source).toContain("v7.1.4-release-certificate");
    expect(completionWorkflow).toContain("name: v7.1.4-release-certificate");
    expect(completionWorkflow).toContain("channel: [release-candidate, stable]");
    expect(completionWorkflow).toContain("--retries=0");
  });

  it("packages reviewed release identity and integrity evidence", () => {
    expect(releaseWorkflow).toContain("pdf-studio-v7.1.4-release-freeze.json");
    expect(releaseWorkflow).toContain("pdf-studio-v7.1.4-release-notes.md");
    expect(releaseWorkflow).toContain("pdf-studio-v7.1.4-release-metadata.json");
    expect(releaseWorkflow).toContain("pdf-studio-v7.1.4-release-integrity.json");
    expect(releaseWorkflow).toContain("pdf-studio-v7.1.4-license-inventory.json");
    expect(releaseWorkflow).toContain("body_path: release-assets/pdf-studio-v7.1.4-release-notes.md");
    expect(releaseWorkflow).toContain("sha256sum pdf-studio-*");
    expect(releaseNotes).toContain("# PDF Studio v7.1.4");
  });

  it("keeps stable promotion exact-tag gated and persistent formats frozen", () => {
    expect(releaseWorkflow).toContain('tags: ["v7.1.4"]');
    expect(releaseWorkflow).toContain("Verify stable tag commit belongs to main history");
    expect(releaseWorkflow).toContain("Browser-qualify exact stable artifact");
    expect(releaseWorkflow).toContain("smoke-stable");
    expect(releaseSource).toContain('APP_VERSION = "7.1.4"');
    expect(releaseSource).toContain("PROJECT_PACKAGE_VERSION = 9");
    expect(releaseSource).toContain("DATABASE_SCHEMA_VERSION = 13");
  });

  it("audits current product artifacts in addition to historical v7 engine gates", () => {
    expect(auditSource).toContain("current task-first P1–P8 release artifact exists");
    expect(auditSource).toContain("src/files/nativeFileWorkflow.ts");
    expect(auditSource).toContain("src/trust/outputVerification.ts");
    expect(auditSource).toContain("src/security/redactionDiscovery.ts");
    expect(auditSource).toContain("Editor and Secure publication paths remain fidelity-certified");
  });
});

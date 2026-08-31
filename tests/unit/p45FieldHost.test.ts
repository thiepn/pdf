import { describe, expect, it } from "vitest";
import workflow from "../../.github/workflows/p45-qualification-pages.yml?raw";
import fieldHostRaw from "../../docs/reconstruction/evidence/p45/field-host.json?raw";

const fieldHost = JSON.parse(fieldHostRaw) as Record<string, unknown>;

describe("P45 field qualification host", () => {
  it("freezes the exact P42 consumer baseline on an isolated HTTPS path", () => {
    expect(fieldHost.product_baseline_commit).toBe("be223e37d3ecafe6695aa6fe4fe7f901f95f478c");
    expect(fieldHost.qualification_path).toBe("qualification/p42");
    expect(fieldHost.qualification_url).toBe("https://thiepn.github.io/pdf/qualification/p42/");
    expect(fieldHost.observation_policy).toBe("human-physical-device-only");
  });

  it("rebuilds and byte-compares the Stable root before any qualification deployment", () => {
    expect(workflow).toContain("Prove rebuilt Stable root equals the live Pages root");
    expect(workflow).toContain("cmp --silent /tmp/live-release-integrity.json stable/dist/release-integrity.json");
    expect(workflow).toContain("Qualification overlay deployment is refused");
    expect(workflow).toContain("ref: ${{ env.STABLE_COMMIT }}");
  });

  it("reconstructs the published root with the historical stable release channel", () => {
    const stableStep = workflow.slice(
      workflow.indexOf("Rebuild the published Stable root deterministically"),
      workflow.indexOf("Prove rebuilt Stable root equals the live Pages root")
    );
    expect(stableStep).toContain('VITE_RELEASE_CHANNEL="stable"');
    expect(stableStep).not.toContain('VITE_RELEASE_CHANNEL="release-candidate"');
  });

  it("builds the qualification baseline independently and reproducibly", () => {
    expect(workflow).toContain("ref: ${{ env.BASELINE_COMMIT }}");
    expect(workflow).toContain('qualification_base="${PAGES_BASE_PATH}${QUALIFICATION_PATH}/"');
    expect(workflow).toContain("p45-qualification-first.sha256");
    expect(workflow).toContain("p45-qualification-second.sha256");
    expect(workflow).toContain("diff -u /tmp/p45-qualification-first.sha256 /tmp/p45-qualification-second.sha256");
    const qualificationStep = workflow.slice(
      workflow.indexOf("Build frozen P42 qualification distribution reproducibly"),
      workflow.indexOf("Compose Stable root plus isolated qualification subtree")
    );
    expect(qualificationStep.match(/VITE_RELEASE_CHANNEL="release-candidate"/g)).toHaveLength(2);
  });

  it("proves the Stable root remains unchanged after deployment", () => {
    expect(workflow).toContain("Verify Stable root unchanged and qualification PWA reachable");
    expect(workflow).toContain('test "$actual_stable" = "$EXPECTED_STABLE_INTEGRITY"');
    expect(workflow).toContain('test "$actual_qualification" = "$EXPECTED_QUALIFICATION_INTEGRITY"');
  });

  it("does not create human observations or result files", () => {
    expect(workflow).not.toMatch(/sessions\/.*\.json/);
    expect(workflow).not.toMatch(/device-runs\/.*\.json/);
    expect(workflow).not.toContain("PASS WITH EXPECTED LIMITATION");
    expect(workflow).not.toContain('"PASS"');
  });
});

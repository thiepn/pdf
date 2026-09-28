import { describe, expect, it } from "vitest";
import stable from "../../.github/workflows/release.yml?raw";
import candidate from "../../.github/workflows/deploy.yml?raw";
import verification from "../../.github/workflows/release-completion.yml?raw";
import preparation from "../../scripts/releases/prepare-browser-corpora.mjs?raw";
import pkg from "../../package.json";

describe("release publication completeness", () => {
  it("prepares stress, adversarial, compatibility and external corpora before qualification", () => {
    for (const workflow of [stable, candidate]) {
      const preparationIndex = workflow.indexOf("node scripts/releases/prepare-browser-corpora.mjs");
      const browserIndex = workflow.indexOf("run: npm run test:e2e");
      expect(preparationIndex).toBeGreaterThan(0);
      expect(preparationIndex).toBeLessThan(browserIndex);
      expect(workflow).toContain('R8_EXTERNAL_CORPUS: "1"');
      expect(workflow).toContain("--workers=2 --retries=0");
    }
    for (const script of ["phase11/generate_corpus.py", "phase28/generate_adversarial_corpus.py", "p8/generate_compatibility_corpus.py", "p0/generate_stress_corpus.py", "reconstruction/r8_external_corpus.py", "reconstruction/r8_validate_corpus.py"]) expect(preparation).toContain(script);
  });
  it("serializes candidate and stable publication without cancelling a running release", () => {
    for (const workflow of [stable, candidate]) {
      expect(workflow).toContain("group: pages\n  cancel-in-progress: false");
    }
    expect(candidate).toContain("if: github.ref == 'refs/heads/main'");
    expect(stable).toContain("merge-base --is-ancestor");
    expect(stable).toContain("needs: smoke-stable");
  });
  it("dry-runs both channels without publication permissions and tests the exact artifacts", () => {
    expect(verification).toContain("channel: [release-candidate, stable]");
    expect(verification).toContain("project: [chromium, firefox, webkit, mobile-chromium, tablet-webkit]");
    expect(verification).toContain("VITE_RELEASE_CHANNEL: ${{ matrix.channel }}");
    expect(verification).toContain("certify-browser-matrix.mjs");
    expect(verification).toContain('test "$(cat /tmp/pdf-release-runtime/qualification-sha.txt)" = "$GITHUB_SHA"');
    expect(verification).toContain("diff -u /tmp/pdf-release-runtime/qualification-dist.sha256 /tmp/downloaded-dist.sha256");
    expect(verification).not.toMatch(/contents: write|pages: write|id-token: write|deploy-pages|action-gh-release/);
  });
  it("pins the reviewed security patch and rejects moderate-or-higher dependency findings", () => {
    expect(pkg.devDependencies.vitest).toBe("4.1.11");
    expect(pkg.scripts["audit:security"]).toBe("npm audit --audit-level=moderate");
  });
});

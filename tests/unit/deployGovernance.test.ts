import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

describe("Pages deployment governance", () => {
  it("decides whether Pages may deploy before the expensive qualification job", () => {
    expect(workflow).toContain("deployment-policy:");
    expect(workflow).toContain("should_deploy: ${{ steps.policy.outputs.should_deploy }}");
    expect(workflow).toContain("version: ${{ steps.policy.outputs.version }}");
    expect(workflow).toContain("Stable Pages preserved");
  });

  it("refuses same-version Stable overwrite without failing the main workflow", () => {
    expect(workflow).toContain("Refuse same-version candidate overwrite of Stable Pages");
    expect(workflow).toContain('echo "should_deploy=false" >> "$GITHUB_OUTPUT"');
    expect(workflow).not.toContain("Bump package.json before deploying another main-branch release-candidate build.");
    expect(workflow).not.toMatch(/Stable tag v\$\{version\} already exists[\s\S]{0,300}exit 1/);
  });

  it("gates qualification, deployment, and smoke on the policy decision", () => {
    expect(workflow.match(/if: needs\.deployment-policy\.outputs\.should_deploy == 'true'/g)?.length).toBe(3);
    expect(workflow).toContain("needs: [deployment-policy, qualify-build]");
    expect(workflow).toContain("needs: [deployment-policy, deploy]");
  });

  it("checks the deployed version dynamically rather than hard-coding v7", () => {
    expect(workflow).toContain("EXPECTED_VERSION: ${{ needs.deployment-policy.outputs.version }}");
    expect(workflow).toContain('grep -F "${EXPECTED_VERSION}"');
    expect(workflow).not.toContain("grep -F '7.0.0'");
  });
});

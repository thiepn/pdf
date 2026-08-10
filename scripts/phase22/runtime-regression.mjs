import assert from "node:assert/strict";
import { assessDeployment, cacheNamespaceForBase, githubPagesProjectBase, normalizeBasePath, pathIsWithinBase } from "../../src/release/deployment.ts";

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

test("normalizes root and repository base paths", () => {
  assert.equal(normalizeBasePath("/"), "/");
  assert.equal(normalizeBasePath("pdf"), "/pdf/");
  assert.equal(normalizeBasePath("//pdf//"), "/pdf/");
});

test("derives deterministic cache namespaces", () => {
  assert.equal(cacheNamespaceForBase("/"), "root");
  assert.equal(cacheNamespaceForBase("/PDF Studio/"), "pdf-studio");
});

test("derives GitHub Pages project base", () => {
  assert.equal(githubPagesProjectBase("thiepn/pdf"), "/pdf/");
});

test("accepts paths within a repository base", () => {
  assert.equal(pathIsWithinBase("/pdf/", "/pdf/"), true);
  assert.equal(pathIsWithinBase("/pdf/assets/app.js", "/pdf/"), true);
  assert.equal(pathIsWithinBase("/other/", "/pdf/"), false);
});

test("flags shared github.io project origins", () => {
  const result = assessDeployment({ hostname: "thiepn.github.io", pathname: "/pdf/" }, "/pdf/");
  assert.equal(result.withinBase, true);
  assert.equal(result.githubPagesProjectSite, true);
  assert.equal(result.sharedGithubIoOrigin, true);
});

test("does not flag dedicated custom hostnames", () => {
  const result = assessDeployment({ hostname: "pdf.example.com", pathname: "/" }, "/");
  assert.equal(result.withinBase, true);
  assert.equal(result.sharedGithubIoOrigin, false);
});

console.log(`Phase 22 runtime regression: ${passed}/6 checks passed.`);

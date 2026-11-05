// Dependency-free regression against an unqualified or hand-edited npm lockfile.
// npm audit --audit-level=moderate remains a mandatory separate real-registry gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
test("minimal exactly pinned security fixes and existing toolchain remain immutable", () => {
  assert.equal(manifest.packageManager, "npm@10.9.2");
  assert.equal(manifest.devDependencies.vite, "8.1.6");
  assert.equal(manifest.devDependencies.vitest, "4.1.12");
  assert.equal(manifest.dependencies?.undici, undefined, "Undici must remain transitive");
  assert.equal(manifest.devDependencies?.undici, undefined, "Undici must remain transitive");
  assert.equal(manifest.overrides?.undici, undefined, "Do not rely on npm 10.9.2 override resolution");
  assert.equal(manifest.devDependencies["@playwright/test"], "1.62.0");
  assert.equal(manifest.dependencies.mupdf, "1.28.0");
});
test("lockfile resolves all four repaired package identities with real registry integrity", () => {
  assert.equal(lock.lockfileVersion, 3);
  for (const [name, version] of Object.entries({
    vite: "8.1.6", vitest: "4.1.12", undici: "7.30.1", "@vitest/mocker": "4.1.12"
  })) {
    const node = lock.packages?.["node_modules/" + name];
    assert.equal(node?.version, version, "Wrong resolved " + name + ": " + node?.version);
    assert.match(node?.resolved ?? "", /^https:\/\//, "Missing HTTPS registry origin: " + name);
    assert.match(node?.integrity ?? "", /^sha(?:512|384|256)-/, "No authenticated package integrity: " + name);
  }
  assert.equal(lock.packages[""].devDependencies?.vite, manifest.devDependencies.vite);
  assert.equal(lock.packages[""].devDependencies?.vitest, manifest.devDependencies.vitest);
});
test("security audit and strict D16/human release refusal remain mandatory", () => {
  assert.equal(manifest.scripts["audit:security"], "npm audit --audit-level=moderate");
  const full = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(full, /npm run audit:security/);
  const d16 = readFileSync("scripts/design/d16_release_scope.py", "utf8");
  assert.match(d16, /automatic_merge_allowed/);
  assert.match(d16, /automatic_deployment_allowed/);
  assert.match(d16, /NOT_QUALIFIED/);
});

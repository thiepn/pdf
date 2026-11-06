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
  assert.equal(manifest.overrides?.undici, "7.30.1", "Pin the vulnerable jsdom-transitive package to minimum fixed version");
  assert.equal(Object.keys(manifest.overrides??{}).length, 1, "No unrelated dependency override is authorized");
  const projectNpmrc = (() => { try { return readFileSync(".npmrc", "utf8"); } catch { return ""; } })();
  assert.doesNotMatch(projectNpmrc, /legacy-peer-deps\s*=\s*true/i, "Peer-resolution workaround must never persist into normal installs");
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

test("Arborist optional-peer workaround is confined to generating the lockfile", () => {
  const job = readFileSync(".github/workflows/pdf04-security-lock.yml","utf8");
  const only = job.match(/npm install[^\n]*--package-lock-only[^\n]*--legacy-peer-deps/g) ?? [];
  assert.equal(only.length,1,"Only one documented peer workaround is permitted");
  assert.match(job,/npm ci --no-audit --no-fund\s*\n\s*npm ls --all/,"Normal npm ci and full dependency-tree validation remain strict");
  assert.match(job,/npm audit --audit-level=moderate/,"Real registry vulnerability gate remains mandatory");
  assert.doesNotMatch(job,/npm ci[^\n]*legacy-peer-deps|npm audit[^\n]*legacy-peer-deps/);
});
test("Security changes trigger real Chromium Firefox WebKit masked export and re-open gates", () => {
  const job = readFileSync(".github/workflows/pdf03-focused-real-browser.yml","utf8");
  assert.match(job,/^      - package-lock\.json$/m);
  assert.match(job,/^      - package\.json$/m);
  assert.match(job,/browser: \[chromium, firefox, webkit\]/);
  assert.match(job,/tests\/e2e\/d14-native-export\.spec\.mjs/);
  assert.match(job,/--retries=0/);
});

test("full browser shards use real container TLS and keep external reader corpus mandatory", () => {
  const ci=readFileSync(".github/workflows/ci.yml","utf8");
  const start=ci.indexOf("  browser-regression-shard:");
  const end=ci.indexOf("  browser-regression:",start);
  assert.ok(start>0&&end>start);
  const browser=ci.slice(start,end);
  assert.match(browser,/mcr\.microsoft\.com\/playwright:v1\.62\.0-noble/);
  assert.match(browser,/apt-get install -y --no-install-recommends python3-venv/);
  assert.match(browser,/\/usr\/bin\/python3 -m venv \/tmp\/pdf-browser-python/);
  assert.match(browser,/\/tmp\/pdf-browser-python\/bin\/python -c 'import ssl/);
  assert.doesNotMatch(browser,/actions\/setup-python/,"Do not reintroduce hosted incompatible Python");
  assert.match(browser,/python -m pip install --requirement requirements-phase11\.txt/);
  assert.match(browser,/python scripts\/phase11\/validate_corpus\.py/);
  assert.match(browser,/npm run test:e2e -- --project=/);
  assert.match(ci,/test "\$\{\{ needs\.browser-regression-shard\.result \}\}" = "success"/);
});

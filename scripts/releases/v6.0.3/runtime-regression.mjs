import { readFile } from "node:fs/promises";
import vm from "node:vm";

let passed = 0;
const checks = [];
function check(condition, name) {
  if (!condition) throw new Error(`v6.0.3 maintenance regression failed: ${name}`);
  passed += 1;
  checks.push(name);
}

const packageJson = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
const release = await readFile(new URL("../../../src/core/release.ts", import.meta.url), "utf8");
const main = await readFile(new URL("../../../src/main.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../../../src/views/HomePage.tsx", import.meta.url), "utf8");
const rawSw = await readFile(new URL("../../../public/sw.js", import.meta.url), "utf8");
const projectPackage = await readFile(new URL("../../../src/projects/projectPackage.ts", import.meta.url), "utf8");
const tagged = await readFile(new URL("../../../.github/workflows/release.yml", import.meta.url), "utf8");
const deploy = await readFile(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");

check(/^6\.\d+\.\d+$/.test(packageJson.version) && release.includes(`APP_VERSION = "${packageJson.version}"`), "6.0.3+ 6.x compatibility version synchronization");
check(/!safeMode && "serviceWorker" in navigator/.test(main), "Safe Mode suppresses service-worker controllerchange reload participation");
check(!/await removeSharedInboxFiles\(\[shared\.id\]\);\s*const kind/.test(home) && /processFile\(shared\.file, kind, undefined, shared\.id\)/.test(home), "shared inbox item is not removed before project import succeeds");
check(/inboxId\) \{[\s\S]*(removeSharedInboxFiles|acknowledgeSharedInboxFiles)\(\[inboxId\]\)/.test(home), "successful shared import removes or durably acknowledges the inbox item only after project creation");
check(/deferredInboxIds/.test(home) && /shared file remains in the local inbox/.test(home), "failed shared imports remain recoverable without an auto-retry loop");
check(/Promise\.allSettled\(inserted\.map\(\(key\) => cache\.delete\(key\)\)\)/.test(rawSw), "share-target intake rolls back partial cache writes");
check(/validatePackageSemanticReferences/.test(projectPackage) && /Project image references missing asset/.test(projectPackage), "project package rejects missing editor asset references");
check(/assertUniquePackageIds\(ocrJobs/.test(projectPackage) && /references missing job/.test(projectPackage) && /is duplicated/.test(projectPackage), "project package rejects duplicate/orphan OCR semantic references");
check(/Verify stable tag commit belongs to main history/.test(tagged) && /merge-base --is-ancestor/.test(tagged), "Stable tag provenance is main-history based rather than race-prone HEAD equality");
check(!/Stable tag must point at the current main HEAD/.test(tagged), "Stable release no longer requires mutable main HEAD equality");
check(/test:runtime:v6\.0\.2/.test(deploy) && /test:runtime:v6\.0\.3/.test(deploy), "Pages deployment preserves v6.0.2 regression and adds v6.0.3 regression");
check(packageJson.scripts?.["release:web"]?.includes("test:runtime:v6.0.3"), "v6.0.3 maintenance regression is release-gated");

function loadWorker() {
  const deleted = [];
  let puts = 0;
  const shareCache = {
    async put(key) {
      puts += 1;
      if (puts === 2) throw new Error("quota");
    },
    async delete(key) { deleted.push(key); return true; },
    async match() { return undefined; },
    async addAll() {}
  };
  const releaseCache = { async addAll() {}, async put() {}, async match() { return undefined; } };
  const sandbox = {
    self: {
      location: { href: "https://example.test/app/sw.js", origin: "https://example.test" },
      registration: { scope: "https://example.test/app/" },
      addEventListener() {}
    },
    caches: {
      async keys() { return []; },
      async open(name) { return name.includes("share-inbox") ? shareCache : releaseCache; },
      async delete() { return true; }
    },
    fetch: async () => new Response(JSON.stringify({ assets: ["./assets/app.js"] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    URL, Response, Request, FormData, Blob, crypto, console, Set, Number, Error, Promise
  };
  const sw = rawSw
    .replaceAll("__LPS_RELEASE_VERSION__", "6.0.3")
    .replaceAll("__LPS_RELEASE_CHANNEL__", "release-candidate")
    .replaceAll("__LPS_RELEASE_BUILD_EPOCH__", "3000");
  vm.runInNewContext(sw, sandbox);
  return { sandbox, deleted };
}

{
  const { sandbox, deleted } = loadWorker();
  const one = new Blob(["one"], { type: "application/pdf" });
  Object.defineProperty(one, "name", { value: "one.pdf" });
  const two = new Blob(["two"], { type: "application/pdf" });
  Object.defineProperty(two, "name", { value: "two.pdf" });
  let rejected = false;
  try {
    await sandbox.receiveShareTarget({ formData: async () => ({ getAll: () => [one, two] }) });
  } catch (error) { rejected = /quota/.test(String(error)); }
  check(rejected && deleted.length === 1, "partial multi-file share intake is rolled back atomically");
}

console.log(JSON.stringify({ name: "v6.0.3 maintenance regression", passed, total: passed, checks }, null, 2));

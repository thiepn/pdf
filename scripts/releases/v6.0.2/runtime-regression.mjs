import { readFile } from "node:fs/promises";
import vm from "node:vm";

let passed = 0;
const checks = [];
function check(condition, name) {
  if (!condition) throw new Error(`v6.0.2 maintenance regression failed: ${name}`);
  passed += 1;
  checks.push(name);
}

const packageJson = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
const release = await readFile(new URL("../../../src/core/release.ts", import.meta.url), "utf8");
const rawSw = await readFile(new URL("../../../public/sw.js", import.meta.url), "utf8");
const manager = await readFile(new URL("../../../src/release/serviceWorkerManager.ts", import.meta.url), "utf8");
const reporter = await readFile(new URL("../../../src/release/ReleaseHealthReporter.tsx", import.meta.url), "utf8");
const main = await readFile(new URL("../../../src/main.tsx", import.meta.url), "utf8");
const deploy = await readFile(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const tagged = await readFile(new URL("../../../.github/workflows/release.yml", import.meta.url), "utf8");
const projectPackage = await readFile(new URL("../../../src/projects/projectPackage.ts", import.meta.url), "utf8");
const releasePage = await readFile(new URL("../../../src/views/ReleasePage.tsx", import.meta.url), "utf8");
const phase30Unit = await readFile(new URL("../../../tests/unit/phase30ReleaseFreeze.test.ts", import.meta.url), "utf8");
const packageValidation = await readFile(new URL("../../../src/projects/packageValidation.ts", import.meta.url), "utf8");

check(/^6\.\d+\.\d+$/.test(packageJson.version) && release.includes(`APP_VERSION = "${packageJson.version}"`), "6.x compatibility version synchronization");
check(/assertNoSameVersionStableDowngrade/.test(rawSw) && /channelRank\(candidate\.channel\)/.test(rawSw), "service worker prevents same-version Stable downgrade");
check(/Production offline asset manifest is unavailable/.test(rawSw) && /caches\.delete\(CACHE_VERSION\)/.test(rawSw), "production precache fails closed and removes partial cache");
check(/GET_OFFLINE_STATUS/.test(manager) && /if \(!status\?\.ready\) return false/.test(manager) && /CLIENT_HEALTHY/.test(manager), "healthy handshake requires complete offline release");
check(/ReleaseHealthReporter/.test(main) && /!safeMode \? <ReleaseHealthReporter/.test(main) && !/document\.readyState === "complete"/.test(main) && /useEffect/.test(reporter), "healthy handshake occurs after React commit, stays disabled in Safe Mode, and does not rely on window load");
check(/Refuse same-version candidate overwrite of Stable Pages/.test(deploy) && /refs\/tags\/v\$\{version\}/.test(deploy), "main Pages deployment refuses same-version Stable overwrite");
check((/Verify stable tag points at current main/.test(tagged) && /refs\/heads\/main/.test(tagged)) || (/Verify stable tag commit belongs to main history/.test(tagged) && /merge-base --is-ancestor/.test(tagged)), "Stable tag must originate from main history");
check(/PDF Studio \{release\.version\}/.test(releasePage) && !/v6\.0\.1/.test(releasePage), "release UI derives current version dynamically");
check(/toMatch\(\/\^6\\\./.test(phase30Unit) && !/toBe\("6\.0\.1"\)/.test(phase30Unit), "Phase 30 unit assertion accepts later qualified v6 releases");

function loadWorker({ channel, epoch, keys = [], manifestOk = true }) {
  const deleted = [];
  const cache = {
    async addAll() {},
    async put() {},
    async match() { return undefined; }
  };
  const sandbox = {
    self: {
      location: { href: "https://example.test/app/sw.js", origin: "https://example.test" },
      registration: { scope: "https://example.test/app/" },
      addEventListener() {}
    },
    caches: {
      async keys() { return keys; },
      async open() { return cache; },
      async delete(key) { deleted.push(key); return true; }
    },
    fetch: async () => manifestOk
      ? new Response(JSON.stringify({ assets: ["./assets/app.js"] }), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response("unavailable", { status: 503 }),
    URL, Response, Request, FormData, crypto, console, Set, Number, Error
  };
  const sw = rawSw
    .replaceAll("__LPS_RELEASE_VERSION__", "6.0.2")
    .replaceAll("__LPS_RELEASE_CHANNEL__", channel)
    .replaceAll("__LPS_RELEASE_BUILD_EPOCH__", String(epoch));
  vm.runInNewContext(sw, sandbox);
  return { sandbox, deleted };
}

{
  const { sandbox } = loadWorker({ channel: "stable", epoch: 1000 });
  const prefix = "local-pdf-studio-app-release-";
  check(sandbox.isSupersededReleaseCache(`${prefix}6.0.2-release-candidate-5000`) === true, "Stable cache supersedes newer same-version candidate cache");
  check(sandbox.isSupersededReleaseCache(`${prefix}6.0.2-stable-2000`) === false, "Stable worker preserves newer same-channel cache");
}

{
  const stableCache = "local-pdf-studio-app-release-6.0.2-stable-1000";
  const { sandbox } = loadWorker({ channel: "release-candidate", epoch: 2000, keys: [stableCache] });
  let rejected = false;
  try { await sandbox.assertNoSameVersionStableDowngrade(); } catch (error) { rejected = /Refusing to replace/.test(String(error)); }
  check(rejected, "candidate worker refuses installation when same-version Stable cache exists");
}

{
  const { sandbox, deleted } = loadWorker({ channel: "release-candidate", epoch: 3000, manifestOk: false });
  let rejected = false;
  try { await sandbox.precacheRelease(); } catch (error) { rejected = /offline asset manifest is unavailable/i.test(String(error)); }
  check(rejected && deleted.some((name) => /6\.0\.2-release-candidate-3000/.test(name)), "failed production precache rejects install and deletes partial release cache");
}

check(/requirePayloadRange\(asset\.offset/.test(projectPackage) && /requireArray<ProjectPackageAssetHeader>/.test(projectPackage), "editor assets require concrete validated payload ranges");
check(/requireArray<OcrJob>/.test(projectPackage) && /requireArray<ProjectPackageOcrPageHeader>/.test(projectPackage), "project-package collection fields require arrays");
check(/requireNonEmptyString\(header\.manifest\.id/.test(projectPackage) && /requireNonEmptyString\(header\.manifest\.name/.test(projectPackage), "required project manifest strings are validated before reconstruction");
check(/export function requirePayloadRange/.test(packageValidation) && /range is missing/.test(packageValidation), "required payload-range helper rejects absent ranges");

console.log(JSON.stringify({ name: "v6.0.2 maintenance regression", passed, total: passed, checks }, null, 2));

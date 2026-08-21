import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) process.exitCode = 1;
}

const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const release = await readFile(new URL("../../src/core/release.ts", import.meta.url), "utf8");
const projectPackage = await readFile(new URL("../../src/projects/projectPackage.ts", import.meta.url), "utf8");
const deploy = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const taggedRelease = await readFile(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
const ci = await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
const security = await readFile(new URL("../../SECURITY.md", import.meta.url), "utf8");

check("qualified release line", /^[67]\.\d+\.\d+$/.test(packageJson.version) && release.includes(`APP_VERSION = "${packageJson.version}"`), `package and runtime remain synchronized on ${packageJson.version}`);
check("candidate by default", /VITE_RELEASE_CHANNEL === "stable" \? "stable" : "release-candidate"/.test(release), "source defaults to release-candidate unless the qualified stable build explicitly opts in");
check("package compatibility contract", /SUPPORTED_PROJECT_PACKAGE_VERSIONS\s*=\s*\[1, 2, 3, 4, 5, 6, 7, 8, 9\]/.test(release) && /isSupportedProjectPackageVersion/.test(projectPackage), "project backup compatibility is centralized at v1-v9");
check("phase30 runtime in release gate", packageJson.scripts["release:web"]?.includes("test:runtime:phase30"), "the final web release gate includes Phase 30");
check("phase30 migration/security gates", packageJson.scripts["release:web"]?.includes("audit:phase30:migrations") && packageJson.scripts["release:web"]?.includes("audit:phase30:security"), "final release requires migration and security/privacy audits");
check("ci frozen release qualification", /run:\s*npm run release:web/.test(ci), "CI runs the frozen non-browser release qualification before the dedicated browser job");
check("candidate pages deployment", /VITE_RELEASE_CHANNEL:\s*release-candidate/.test(deploy), "ordinary main-branch Pages deployments are explicitly release-candidate builds");
check("stable tagged build", /VITE_RELEASE_CHANNEL:\s*stable/.test(taggedRelease), `the v${packageJson.version} tagged workflow is the only stable-channel build path`);
check("stable tag exactness", taggedRelease.includes(`tags: ["v${packageJson.version}"]`), `stable packaging is restricted to the v${packageJson.version} tag`);
check("stable release not draft", /draft:\s*false/.test(taggedRelease), `qualified v${packageJson.version} publication is not left as a draft release`);
check("readme final release contract", /Phase 30/.test(readme) && readme.includes(`v${packageJson.version}`) && /release-candidate/.test(readme), "README documents the final promotion boundary");
check("security final gate", /Phase 30/.test(security) && /stable/i.test(security), "security policy describes the final stable gate");

const passed = checks.filter((item) => item.passed).length;
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
console.log(`Phase 30 runtime regression: ${passed}/${checks.length} passed.`);
if (passed !== checks.length) process.exitCode = 1;

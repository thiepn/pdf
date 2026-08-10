import { readFile } from "node:fs/promises";

const fail = (message) => { console.error(message); process.exitCode = 1; };
const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

let packageJson;
let lock;
try {
  packageJson = JSON.parse(await readFile("package.json", "utf8"));
} catch (error) {
  console.error(`Cannot read package.json: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
try {
  lock = JSON.parse(await readFile("package-lock.json", "utf8"));
} catch {
  console.error("package-lock.json is required for Phase 27 stable qualification. Run the GitHub 'Bootstrap dependency lock' workflow and merge its PR.");
  process.exit(1);
}

if (lock.lockfileVersion !== 3) fail(`Expected npm lockfileVersion 3, found ${String(lock.lockfileVersion)}.`);
if (lock.name !== packageJson.name) fail(`Lockfile name ${String(lock.name)} does not match package ${packageJson.name}.`);
if (lock.version !== packageJson.version) fail(`Lockfile version ${String(lock.version)} does not match package ${packageJson.version}.`);
const root = lock.packages?.[""];
if (!root) fail("Lockfile is missing the root package entry.");

for (const section of ["dependencies", "devDependencies"]) {
  const wanted = packageJson[section] ?? {};
  const locked = root?.[section] ?? {};
  const wantedNames = Object.keys(wanted).sort();
  const lockedNames = Object.keys(locked).sort();
  if (JSON.stringify(wantedNames) !== JSON.stringify(lockedNames)) fail(`Lockfile root ${section} names differ from package.json.`);
  for (const [name, version] of Object.entries(wanted)) {
    if (!exact.test(version)) fail(`${section}.${name} is not an exact version: ${version}`);
    if (locked[name] !== version) fail(`Lockfile root ${section}.${name}=${String(locked[name])} does not match ${version}.`);
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry?.version) fail(`Lockfile is missing node_modules/${name}.`);
    else if (entry.version !== version) fail(`Resolved ${name}@${entry.version}, expected exact ${version}.`);
    if (entry?.resolved && !/^https:\/\//.test(entry.resolved)) fail(`${name} has non-HTTPS resolved URL: ${entry.resolved}`);
    if (entry && !entry.integrity) fail(`${name} is missing an integrity hash.`);
  }
}

if (!process.exitCode) console.log(`Phase 27 lockfile audit passed: npm lockfile v3 exactly resolves ${Object.keys(packageJson.dependencies ?? {}).length + Object.keys(packageJson.devDependencies ?? {}).length} pinned root packages with integrity metadata.`);

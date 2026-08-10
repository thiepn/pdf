import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const dist = resolve(process.cwd(), "dist");

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

await stat(dist);
const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8"));
const releaseChannel = process.env.VITE_RELEASE_CHANNEL === "stable" ? "stable" : "release-candidate";
const generatedAt = process.env.VITE_BUILD_TIMESTAMP || new Date().toISOString();
const parsedEpoch = Date.parse(generatedAt);
const buildEpoch = Number.isFinite(parsedEpoch) ? parsedEpoch : 0;
const releaseMetadata = {
  schemaVersion: 1,
  version: packageJson.version,
  channel: releaseChannel,
  generatedAt,
  buildEpoch,
  sourceUrl: process.env.VITE_SOURCE_URL || ""
};
await writeFile(join(dist, "release-metadata.json"), JSON.stringify(releaseMetadata, null, 2));

const serviceWorkerPath = join(dist, "sw.js");
let serviceWorker = await readFile(serviceWorkerPath, "utf8");
serviceWorker = serviceWorker
  .replaceAll("__LPS_RELEASE_VERSION__", packageJson.version)
  .replaceAll("__LPS_RELEASE_CHANNEL__", releaseChannel)
  .replaceAll("__LPS_RELEASE_BUILD_EPOCH__", String(buildEpoch));
if (/__LPS_RELEASE_[A-Z_]+__/.test(serviceWorker)) throw new Error("Service-worker release identity placeholders were not fully stamped.");
await writeFile(serviceWorkerPath, serviceWorker);

const assets = (await walk(dist))
  .map((file) => relative(dist, file).replaceAll("\\", "/"))
  .filter((name) => !name.endsWith(".map") && !["offline-assets.json", "release-integrity.json"].includes(name))
  .map((name) => `./${name}`)
  .sort();

const manifest = { schemaVersion: 1, generatedAt, assets };
await writeFile(join(dist, "offline-assets.json"), JSON.stringify(manifest, null, 2));
console.log(`Offline asset manifest: ${assets.length} release files.`);

import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
const root = process.cwd();
const target = resolve(root, "public/tesseract");
const coreTarget = resolve(target, "core");
await mkdir(coreTarget, { recursive: true });
const worker = resolve(root, "node_modules/tesseract.js/dist/worker.min.js");
if (!(await exists(worker))) throw new Error("Tesseract worker asset is missing. Run npm install first.");
await cp(worker, resolve(target, "worker.min.js"));
const coreSource = resolve(root, "node_modules/tesseract.js-core");
if (!(await exists(coreSource))) throw new Error("tesseract.js-core is missing. Run npm install first.");
for (const entry of await readdir(coreSource, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!/\.(?:js|wasm|map)$/.test(entry.name)) continue;
  await cp(resolve(coreSource, entry.name), resolve(coreTarget, basename(entry.name)));
}
console.log("Prepared local Tesseract worker/core assets.");

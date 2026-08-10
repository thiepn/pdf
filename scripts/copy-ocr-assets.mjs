import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
const root = process.cwd();
const target = resolve(root, "public/tesseract");
const coreTarget = resolve(target, "core");
await rm(coreTarget, { recursive: true, force: true });
await mkdir(coreTarget, { recursive: true });
const worker = resolve(root, "node_modules/tesseract.js/dist/worker.min.js");
if (!(await exists(worker))) throw new Error("Tesseract worker asset is missing. Run npm install first.");
await cp(worker, resolve(target, "worker.min.js"));
const coreSource = resolve(root, "node_modules/tesseract.js-core");
if (!(await exists(coreSource))) throw new Error("tesseract.js-core is missing. Run npm install first.");

// OCR always initializes Tesseract in LSTM-only mode. Its browser worker then
// selects one of these three self-contained cores based on WebAssembly feature
// detection. Copying the legacy-engine and split-loader alternatives bloats the
// Pages artifact even though this application can never request them.
const coreAssets = [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js"
];
for (const asset of coreAssets) {
  await cp(resolve(coreSource, asset), resolve(coreTarget, asset));
}
console.log("Prepared local Tesseract worker/core assets.");

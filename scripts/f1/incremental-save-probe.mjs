/**
 * Optional F1 MuPDF qualification probe (not a production writer).
 * Run with Node 22.16 and installed pinned dependencies:
 *   node --experimental-strip-types scripts/f1/incremental-save-probe.mjs
 * Each WASM probe runs in a killable subprocess to bound known hangs.
 * Do NOT use this result alone to enable incremental saves in browser Workers.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessIncrementalOutput } from "./incremental-save-contract.mjs";

const cases = ["metadata", "annotation"];
const timeoutMs = 12000;

async function probe(kind) {
  const mupdf = await import("mupdf");
  const { createMinimalPdf } = await import("../../src/fixtures/minimalPdf.ts");
  const input = createMinimalPdf();
  const pdf = new mupdf.PDFDocument(input);
  try {
    const beforeVersions = pdf.countVersions();
    const wasRepaired = pdf.wasRepaired();
    const canSaveIncrementally = pdf.canBeSavedIncrementally();
    if (wasRepaired || !canSaveIncrementally) {
      return { case: kind, passed: false, wasRepaired, canSaveIncrementally, reason: "Synthetic fixture is not incremental-save eligible" };
    }
    if (kind === "metadata") {
      pdf.setMetaData("info:Title", "F1 Incremental Probe");
    } else {
      const page = pdf.loadPage(0);
      try {
        const note = page.createAnnotation("Text");
        try {
          note.setRect([100, 100, 135, 135]);
          note.setContents("F1 annotation probe");
          note.update();
        } finally { note.destroy(); }
      } finally { page.destroy(); }
    }
    const buffer = pdf.saveToBuffer("incremental");
    let output;
    try { output = Uint8Array.from(buffer.asUint8Array()); }
    finally { buffer.destroy(); }
    const reopened = new mupdf.PDFDocument(output);
    try {
      const evidence = assessIncrementalOutput(input, output, beforeVersions, reopened.countVersions());
      let editPresent = false;
      if (kind === "metadata") editPresent = reopened.getMetaData("info:Title") === "F1 Incremental Probe";
      else {
        const page = reopened.loadPage(0);
        try {
          for (const annotation of page.getAnnotations()) {
            try { if (annotation.getContents() === "F1 annotation probe") editPresent = true; }
            finally { annotation.destroy(); }
          }
        } finally { page.destroy(); }
      }
      return {
        case: kind,
        canSaveIncrementally,
        wasRepaired,
        reopenedWasRepaired: reopened.wasRepaired(),
        editPresent,
        ...evidence,
        passed: evidence.passed && editPresent && !reopened.wasRepaired()
      };
    } finally { reopened.destroy(); }
  } finally { pdf.destroy(); }
}

if (process.argv[2] === "--child") {
  try { process.stdout.write(JSON.stringify(await probe(process.argv[3])) + "\n"); }
  catch (error) { process.stderr.write(String(error?.stack ?? error) + "\n"); process.exitCode = 1; }
} else {
  const self = fileURLToPath(import.meta.url);
  const results = [];
  for (const kind of cases) {
    const run = spawnSync(process.execPath, ["--experimental-strip-types", self, "--child", kind], {
      encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024
    });
    if (run.error || run.status !== 0) {
      results.push({ case: kind, passed: false, error: run.error?.code === "ETIMEDOUT" ? "timeout" : (run.stderr || String(run.error || run.signal || run.status)).slice(0, 600) });
    } else {
      try { results.push(JSON.parse(run.stdout.trim().split("\n").at(-1))); }
      catch { results.push({ case: kind, passed: false, error: "invalid child response", output: run.stdout.slice(0, 300) }); }
    }
  }
  const allPassed = results.every(result => result.passed === true);
  process.stdout.write(JSON.stringify({ phase: "F1", runtime: "Node/WASM only", allPassed, timeoutMs, results }, null, 2) + "\n");
  if (!allPassed) process.exitCode = 1;
}

#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { R9_BASELINE_SHA, summarizeSessions } from "./r9_validate_evidence.mjs";

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function buildCertification(sessionEntries) {
  const rawSessions = sessionEntries.map((entry) => entry.session);
  const summary = summarizeSessions(rawSessions);
  if (summary.status !== "HUMAN_UX_TARGET_MET") {
    throw new Error(`R9 certification refused: evidence status is ${summary.status}`);
  }

  const evidence = sessionEntries
    .map((entry) => ({
      session_id: entry.session.session_id,
      tester_id: entry.session.tester_id,
      sha256: hashText(entry.raw.endsWith("\n") ? entry.raw : `${entry.raw}\n`)
    }))
    .sort((a, b) => a.session_id.localeCompare(b.session_id));

  return {
    schema: 1,
    status: "R9_HUMAN_USABILITY_CERTIFIED",
    product_baseline_commit: R9_BASELINE_SHA,
    human_ux_status: summary.status,
    sample: summary.sample,
    metrics: summary.metrics,
    session_metrics: summary.session_metrics,
    blocking_defects: summary.blocking_defects,
    evidence
  };
}

function parseArgs(argv) {
  let out = null;
  const files = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") {
      out = argv[index + 1];
      if (!out) throw new Error("--out requires a path");
      index += 1;
    } else {
      files.push(argv[index]);
    }
  }
  return { out, files };
}

function defaultSessionFiles(repoRoot) {
  const dir = path.join(repoRoot, "docs/reconstruction/evidence/r9/sessions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => path.join(dir, name));
}

function runCli() {
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(scriptDir, "../..");
    const { out, files } = parseArgs(process.argv.slice(2));
    const selected = files.length ? files.map((file) => path.resolve(file)) : defaultSessionFiles(repoRoot);
    if (!selected.length) throw new Error("R9 certification refused: no human session evidence files found");
    const entries = selected.map((file) => {
      const raw = fs.readFileSync(file, "utf8");
      return { raw, session: JSON.parse(raw) };
    });
    const certification = buildCertification(entries);
    const serialized = `${JSON.stringify(certification, null, 2)}\n`;
    if (out) {
      const outputPath = path.resolve(out);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, serialized, "utf8");
      console.log(JSON.stringify({ status: certification.status, output: outputPath }, null, 2));
    } else {
      process.stdout.write(serialized);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

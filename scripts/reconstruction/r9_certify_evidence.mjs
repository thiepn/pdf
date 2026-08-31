#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { R9_BASELINE_SHA, summarizeSessions } from "./r9_validate_evidence.mjs";
import { summarizeRealDeviceRuns } from "./r9_validate_real_device.mjs";

function hashText(text) {
  const normalized = text.endsWith("\n") ? text : `${text}\n`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function digestEntries(entries, idField) {
  return entries
    .map((entry) => ({
      [idField]: entry.record[idField],
      tester_id: entry.record.tester_id,
      sha256: hashText(entry.raw)
    }))
    .sort((a, b) => a[idField].localeCompare(b[idField]));
}

export function buildCertification(sessionEntries, deviceRunEntries = []) {
  const humanSummary = summarizeSessions(sessionEntries.map((entry) => entry.session));
  if (humanSummary.status !== "HUMAN_UX_TARGET_MET") {
    throw new Error(`R9 certification refused: human evidence status is ${humanSummary.status}`);
  }

  const realDeviceSummary = summarizeRealDeviceRuns(deviceRunEntries.map((entry) => entry.run));
  if (realDeviceSummary.status !== "REAL_DEVICE_TARGET_MET") {
    throw new Error(`R9 certification refused: real-device evidence status is ${realDeviceSummary.status}`);
  }

  const normalizedHumanEntries = sessionEntries.map((entry) => ({ raw: entry.raw, record: entry.session }));
  const normalizedDeviceEntries = deviceRunEntries.map((entry) => ({ raw: entry.raw, record: entry.run }));

  return {
    schema: 1,
    status: "R9_HUMAN_USABILITY_CERTIFIED",
    product_baseline_commit: R9_BASELINE_SHA,
    human_ux_status: humanSummary.status,
    real_device_status: realDeviceSummary.status,
    sample: humanSummary.sample,
    metrics: humanSummary.metrics,
    session_metrics: humanSummary.session_metrics,
    real_device: realDeviceSummary,
    blocking_defects: [...humanSummary.blocking_defects, ...realDeviceSummary.blocking_defects],
    evidence: digestEntries(normalizedHumanEntries, "session_id"),
    real_device_evidence: digestEntries(normalizedDeviceEntries, "run_id")
  };
}

function parseArgs(argv) {
  let out = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") {
      out = argv[index + 1];
      if (!out) throw new Error("--out requires a path");
      index += 1;
    } else {
      throw new Error(`unknown argument ${argv[index]}`);
    }
  }
  return { out };
}

function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => path.join(dir, name));
}

function loadEntries(files, field) {
  return files.map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    return { raw, [field]: JSON.parse(raw) };
  });
}

function runCli() {
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(scriptDir, "../..");
    const { out } = parseArgs(process.argv.slice(2));
    const sessionFiles = jsonFiles(path.join(repoRoot, "docs/reconstruction/evidence/r9/sessions"));
    const deviceRunFiles = jsonFiles(path.join(repoRoot, "docs/reconstruction/evidence/r9/device-runs"));
    if (!sessionFiles.length) throw new Error("R9 certification refused: no human session evidence files found");
    if (!deviceRunFiles.length) throw new Error("R9 certification refused: no real-device journey evidence files found");

    const certification = buildCertification(
      loadEntries(sessionFiles, "session"),
      loadEntries(deviceRunFiles, "run")
    );
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

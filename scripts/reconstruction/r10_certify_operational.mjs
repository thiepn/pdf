#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateR10 } from "./r10_gate.mjs";

function hashText(raw) {
  const normalized = raw.endsWith("\n") ? raw : `${raw}\n`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function buildOperationalCertification({ gateResult, baselineRaw, r9CertificationRaw, maintenanceEntries = [] }) {
  if (gateResult.status !== "R10_OPERATIONAL_READY") {
    throw new Error(`R10 certification refused: operational status is ${gateResult.status}`);
  }

  const maintenance = maintenanceEntries
    .map((entry) => ({
      change_id: entry.record.change_id,
      target_commit: entry.record.target_commit,
      status: entry.record.status,
      sha256: hashText(entry.raw)
    }))
    .sort((a, b) => a.change_id.localeCompare(b.change_id));

  return {
    schema: 1,
    status: "R10_OPERATIONAL_CERTIFIED",
    product_baseline_commit: gateResult.product_baseline_commit,
    r9_status: gateResult.r9_status,
    human_ux_status: gateResult.human_ux_status,
    baseline_manifest_sha256: hashText(baselineRaw),
    r9_certification_sha256: hashText(r9CertificationRaw),
    maintenance
  };
}

function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => path.join(dir, name));
}

function loadSessionEntries(dir) {
  return jsonFiles(dir).map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    return { raw, session: JSON.parse(raw) };
  });
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

function runCli() {
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(scriptDir, "../..");
    const { out } = parseArgs(process.argv.slice(2));

    const baselinePath = path.join(repoRoot, "docs/reconstruction/evidence/r10/current-product-baseline.json");
    const r9CertificationPath = path.join(repoRoot, "docs/reconstruction/evidence/r9/certification.json");
    const r9SessionsDir = path.join(repoRoot, "docs/reconstruction/evidence/r9/sessions");
    const maintenanceDir = path.join(repoRoot, "docs/reconstruction/evidence/r10/maintenance");

    const baselineRaw = fs.readFileSync(baselinePath, "utf8");
    const baseline = JSON.parse(baselineRaw);
    if (!fs.existsSync(r9CertificationPath)) {
      throw new Error("R10 certification refused: R9 certification record is absent");
    }
    const r9CertificationRaw = fs.readFileSync(r9CertificationPath, "utf8");
    const r9Certification = JSON.parse(r9CertificationRaw);
    const sessionEntries = loadSessionEntries(r9SessionsDir);
    const maintenanceEntries = jsonFiles(maintenanceDir).map((file) => {
      const raw = fs.readFileSync(file, "utf8");
      return { raw, record: JSON.parse(raw) };
    });

    const gateResult = evaluateR10({
      baseline,
      r9Certification,
      maintenanceRecords: maintenanceEntries.map((entry) => entry.record),
      sessionEntries
    });

    const certification = buildOperationalCertification({
      gateResult,
      baselineRaw,
      r9CertificationRaw,
      maintenanceEntries
    });

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

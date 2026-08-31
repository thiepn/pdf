#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateMaintenanceRecord } from "./r10_change_policy.mjs";

export const R8_FROZEN_PRODUCT_BASELINE = "7c81f95815a3d8740fddef3d76e264ebb19c96f8";

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256Text(raw) {
  const normalized = raw.endsWith("\n") ? raw : `${raw}\n`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function validateProductBaseline(baseline, maintenanceRecords = []) {
  assertion(baseline && typeof baseline === "object" && !Array.isArray(baseline), "current product baseline must be an object");
  assertion(baseline.schema === 1, "current product baseline schema must equal 1");
  assertion(typeof baseline.product_baseline_commit === "string" && /^[0-9a-f]{40}$/.test(baseline.product_baseline_commit), "product_baseline_commit must be a 40-character git SHA");
  assertion(typeof baseline.source === "string" && baseline.source.trim().length > 0, "current product baseline source is required");
  assertion(baseline.maintenance_change_id === null || (typeof baseline.maintenance_change_id === "string" && baseline.maintenance_change_id.trim().length > 0), "maintenance_change_id must be null or a non-empty string");

  if (baseline.maintenance_change_id === null) {
    assertion(baseline.product_baseline_commit === R8_FROZEN_PRODUCT_BASELINE, "baseline without maintenance_change_id must remain the frozen R8 product commit");
  } else {
    const record = maintenanceRecords.find((item) => item.change_id === baseline.maintenance_change_id);
    assertion(record, `current baseline references unknown maintenance change ${baseline.maintenance_change_id}`);
    assertion(record.status === "qualified", "current baseline maintenance record must be qualified");
    assertion(record.product_behavior_changed === true, "maintenance-derived product baseline must come from a product-behavior change");
    assertion(record.target_commit === baseline.product_baseline_commit, "current baseline commit must equal maintenance target_commit");
  }
  return baseline;
}

function validateDigestList(items, idField, minimum, label) {
  assertion(Array.isArray(items) && items.length >= minimum, `${label} must include at least ${minimum} evidence digests`);
  const ids = new Set();
  for (const item of items) {
    assertion(typeof item[idField] === "string" && item[idField].length > 0, `${label} ${idField} is required`);
    assertion(!ids.has(item[idField]), `${label} contains duplicate ${idField} ${item[idField]}`);
    ids.add(item[idField]);
    assertion(typeof item.tester_id === "string" && item.tester_id.length > 0, `${label} tester_id is required`);
    assertion(typeof item.sha256 === "string" && /^[0-9a-f]{64}$/.test(item.sha256), `${label} sha256 is invalid`);
  }
}

function verifyDigests(certifiedItems, entries, idField, recordField, label) {
  assertion(entries.length === certifiedItems.length, `${label} count does not match committed evidence`);
  const byId = new Map(entries.map((entry) => [entry[recordField][idField], entry]));
  for (const item of certifiedItems) {
    const entry = byId.get(item[idField]);
    assertion(entry, `${label} references missing ${idField} ${item[idField]}`);
    assertion(entry[recordField].tester_id === item.tester_id, `${label} tester mismatch for ${idField} ${item[idField]}`);
    assertion(sha256Text(entry.raw) === item.sha256, `${label} digest mismatch for ${idField} ${item[idField]}`);
  }
}

export function validateR9Certification(certification, productBaselineCommit, sessionEntries = [], deviceEntries = []) {
  assertion(certification && typeof certification === "object" && !Array.isArray(certification), "R9 certification must be an object");
  assertion(certification.schema === 1, "R9 certification schema must equal 1");
  assertion(certification.status === "R9_HUMAN_USABILITY_CERTIFIED", "R9 certification status is not certified");
  assertion(certification.human_ux_status === "HUMAN_UX_TARGET_MET", "R9 human UX target is not met");
  assertion(certification.real_device_status === "REAL_DEVICE_TARGET_MET", "R9 real-device target is not met");
  assertion(certification.product_baseline_commit === productBaselineCommit, "R9 certification does not match the current qualified product baseline");
  assertion(certification.sample?.sufficient === true, "R9 certification sample is insufficient");
  assertion(certification.sample?.distinct_testers >= 3, "R9 certification requires at least 3 distinct testers");
  assertion(certification.sample?.low_familiarity_testers >= 2, "R9 certification requires at least 2 low-familiarity testers");
  assertion(Array.isArray(certification.blocking_defects) && certification.blocking_defects.length === 0, "R9 certification contains blocking defects");

  for (const key of ["first_location_accuracy", "no_help_completion", "navigation_prediction_accuracy"]) {
    assertion(certification.metrics?.[key]?.met === true, `R9 metric ${key} is not met`);
  }

  assertion(certification.real_device?.matrix?.sufficient === true, "R9 real-device matrix is insufficient");
  assertion(certification.real_device?.matrix?.covered_slots >= 5, "R9 real-device matrix must cover at least 5 required slots");
  assertion(certification.real_device?.journeys?.sufficient === true, "R9 real-device journey coverage is insufficient");
  assertion(certification.real_device?.journeys?.covered >= 10, "R9 real-device journey coverage must include all 10 journeys");
  assertion(certification.real_device?.installed_pwa_covered === true, "R9 real-device evidence must include installed-PWA recovery coverage");

  validateDigestList(certification.evidence, "session_id", 3, "R9 human evidence");
  validateDigestList(certification.real_device_evidence, "run_id", 5, "R9 real-device evidence");
  verifyDigests(certification.evidence, sessionEntries, "session_id", "session", "R9 human evidence");
  verifyDigests(certification.real_device_evidence, deviceEntries, "run_id", "run", "R9 real-device evidence");

  return certification;
}

export function evaluateR10({ baseline, r9Certification = null, maintenanceRecords = [], sessionEntries = [], deviceEntries = [] }) {
  let validatedRecords;
  try {
    validatedRecords = maintenanceRecords.map(validateMaintenanceRecord);
    validateProductBaseline(baseline, validatedRecords);
  } catch (error) {
    return {
      status: "R10_BLOCKED_BY_POLICY",
      product_baseline_commit: baseline?.product_baseline_commit ?? null,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const blockingMaintenance = validatedRecords.filter((record) => {
    const unresolved = !["qualified", "rolled-back", "superseded"].includes(record.status);
    const severe = record.risk.severity === "critical" || record.risk.data_loss_risk || record.risk.security_privacy_risk;
    return unresolved && severe;
  });

  if (blockingMaintenance.length > 0) {
    return {
      status: "R10_BLOCKED_BY_CRITICAL_MAINTENANCE",
      product_baseline_commit: baseline.product_baseline_commit,
      blocking_changes: blockingMaintenance.map((record) => record.change_id)
    };
  }

  if (!r9Certification) {
    return {
      status: "R10_BLOCKED_BY_R9",
      product_baseline_commit: baseline.product_baseline_commit,
      maintenance_records: validatedRecords.length,
      reason: "R9 human and real-device certification record is absent"
    };
  }

  try {
    validateR9Certification(r9Certification, baseline.product_baseline_commit, sessionEntries, deviceEntries);
  } catch (error) {
    return {
      status: "R10_BLOCKED_BY_R9",
      product_baseline_commit: baseline.product_baseline_commit,
      maintenance_records: validatedRecords.length,
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  return {
    status: "R10_OPERATIONAL_READY",
    product_baseline_commit: baseline.product_baseline_commit,
    r9_status: r9Certification.status,
    human_ux_status: r9Certification.human_ux_status,
    real_device_status: r9Certification.real_device_status,
    maintenance_records: validatedRecords.length,
    blocking_changes: []
  };
}

function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => path.join(dir, name));
}

function loadEntries(dir, recordField) {
  return jsonFiles(dir).map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    return { raw, [recordField]: JSON.parse(raw) };
  });
}

function runCli() {
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(scriptDir, "../..");
    const baselinePath = path.join(repoRoot, "docs/reconstruction/evidence/r10/current-product-baseline.json");
    const r9CertificationPath = path.join(repoRoot, "docs/reconstruction/evidence/r9/certification.json");
    const r9SessionsDir = path.join(repoRoot, "docs/reconstruction/evidence/r9/sessions");
    const r9DeviceRunsDir = path.join(repoRoot, "docs/reconstruction/evidence/r9/device-runs");
    const maintenanceDir = path.join(repoRoot, "docs/reconstruction/evidence/r10/maintenance");

    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const r9Certification = fs.existsSync(r9CertificationPath) ? JSON.parse(fs.readFileSync(r9CertificationPath, "utf8")) : null;
    const maintenanceRecords = jsonFiles(maintenanceDir).map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
    const sessionEntries = r9Certification ? loadEntries(r9SessionsDir, "session") : [];
    const deviceEntries = r9Certification ? loadEntries(r9DeviceRunsDir, "run") : [];
    const result = evaluateR10({ baseline, r9Certification, maintenanceRecords, sessionEntries, deviceEntries });

    console.log(JSON.stringify(result, null, 2));

    const args = process.argv.slice(2);
    const expectedIndex = args.indexOf("--expect-status");
    if (expectedIndex >= 0) {
      const expected = args[expectedIndex + 1];
      if (!expected) throw new Error("--expect-status requires a value");
      if (result.status !== expected) {
        console.error(`Expected ${expected} but received ${result.status}`);
        process.exitCode = 1;
      }
    }
    if (args.includes("--require-ready") && result.status !== "R10_OPERATIONAL_READY") {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify({ status: "R10_BLOCKED_BY_POLICY", error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

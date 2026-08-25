#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CHANGE_CLASSES = new Set([
  "documentation-tooling",
  "dependency-toolchain",
  "compatibility-repair",
  "product-hotfix",
  "security-privacy-data-loss-emergency"
]);

const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const STATUSES = new Set(["planned", "in-progress", "qualified", "rolled-back", "superseded"]);
const FORBIDDEN_KEYS = new Set([
  "password", "passwords", "secret", "secrets", "token", "api_token",
  "document_text", "document_contents", "document_content", "ocr_text",
  "extracted_text", "document_bytes", "file_bytes", "screenshot", "email",
  "email_address", "tester_name", "filename", "file_name", "document_filename"
]);

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function nonEmptyString(value, field) {
  assertion(typeof value === "string" && value.trim().length > 0, `${field} must be a non-empty string`);
}

function boolean(value, field) {
  assertion(typeof value === "boolean", `${field} must be boolean`);
}

function normalizedKey(key) {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function scanPrivacy(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPrivacy(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assertion(!FORBIDDEN_KEYS.has(normalizedKey(key)), `Privacy-sensitive field '${key}' is forbidden at ${location}`);
    scanPrivacy(child, `${location}.${key}`);
  }
}

export function requiredPolicy(record) {
  const cls = record.change_class;
  const productChanged = record.product_behavior_changed === true;
  const securityRisk = record.risk?.security_privacy_risk === true;
  const dataLossRisk = record.risk?.data_loss_risk === true;

  if (cls === "documentation-tooling") {
    return {
      engineering_requalification: false,
      human_requalification: false,
      security_privacy_gate: false
    };
  }

  if (cls === "dependency-toolchain") {
    return {
      engineering_requalification: true,
      human_requalification: productChanged,
      security_privacy_gate: securityRisk
    };
  }

  if (cls === "compatibility-repair" || cls === "product-hotfix") {
    return {
      engineering_requalification: true,
      human_requalification: true,
      security_privacy_gate: securityRisk
    };
  }

  if (cls === "security-privacy-data-loss-emergency") {
    return {
      engineering_requalification: true,
      human_requalification: true,
      security_privacy_gate: true
    };
  }

  return {
    engineering_requalification: false,
    human_requalification: false,
    security_privacy_gate: false
  };
}

export function validateMaintenanceRecord(record) {
  assertion(record && typeof record === "object" && !Array.isArray(record), "maintenance record must be an object");
  scanPrivacy(record);
  assertion(record.schema === 1, "schema must equal 1");
  nonEmptyString(record.change_id, "change_id");
  assertion(CHANGE_CLASSES.has(record.change_class), "change_class is invalid");
  nonEmptyString(record.base_commit, "base_commit");
  nonEmptyString(record.target_commit, "target_commit");
  assertion(record.base_commit !== record.target_commit, "base_commit and target_commit must differ");
  boolean(record.product_behavior_changed, "product_behavior_changed");
  nonEmptyString(record.reason, "reason");
  nonEmptyString(record.rollback_commit, "rollback_commit");

  assertion(record.risk && typeof record.risk === "object" && !Array.isArray(record.risk), "risk must be an object");
  assertion(SEVERITIES.has(record.risk.severity), "risk.severity is invalid");
  boolean(record.risk.data_loss_risk, "risk.data_loss_risk");
  boolean(record.risk.security_privacy_risk, "risk.security_privacy_risk");

  assertion(Array.isArray(record.affected_workflows), "affected_workflows must be an array");
  record.affected_workflows.forEach((item, index) => nonEmptyString(item, `affected_workflows[${index}]`));

  assertion(record.required_gates && typeof record.required_gates === "object", "required_gates must be an object");
  assertion(record.gate_results && typeof record.gate_results === "object", "gate_results must be an object");
  for (const key of ["engineering_requalification", "human_requalification", "security_privacy_gate"]) {
    boolean(record.required_gates[key], `required_gates.${key}`);
    const result = record.gate_results[key];
    assertion(result === null || typeof result === "boolean", `gate_results.${key} must be boolean or null`);
  }

  assertion(STATUSES.has(record.status), "status is invalid");
  assertion(typeof record.notes === "string", "notes must be a string");

  if (record.change_class === "documentation-tooling") {
    assertion(record.product_behavior_changed === false, "documentation-tooling cannot claim a product behavior change");
  }
  if (record.risk.data_loss_risk || record.risk.security_privacy_risk) {
    assertion(
      record.change_class === "security-privacy-data-loss-emergency",
      "security/privacy or data-loss risk must use security-privacy-data-loss-emergency class"
    );
  }

  const expected = requiredPolicy(record);
  for (const [key, value] of Object.entries(expected)) {
    assertion(record.required_gates[key] === value, `required_gates.${key} must be ${value} for ${record.change_class}`);
  }

  if (expected.human_requalification) {
    assertion(record.affected_workflows.length > 0, "affected_workflows must identify human workflows requiring requalification");
  }

  if (record.status === "qualified") {
    for (const [key, required] of Object.entries(expected)) {
      if (required) assertion(record.gate_results[key] === true, `qualified record requires gate_results.${key}=true`);
    }
  }

  return record;
}

function runCli() {
  try {
    const files = process.argv.slice(2);
    if (!files.length) throw new Error("provide at least one maintenance record JSON file");
    const results = files.map((file) => {
      const record = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
      validateMaintenanceRecord(record);
      return { file, change_id: record.change_id, status: record.status, policy: requiredPolicy(record) };
    });
    console.log(JSON.stringify({ status: "R10_CHANGE_POLICY_VALID", records: results }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: "R10_CHANGE_POLICY_INVALID", error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

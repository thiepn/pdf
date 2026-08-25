#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const R9_BASELINE_SHA = "7c81f95815a3d8740fddef3d76e264ebb19c96f8";
export const TARGET = 0.9;

const DISCOVERY_IDS = Array.from({ length: 20 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`);
const COMPLETION_IDS = Array.from({ length: 10 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);
const ALLOWED_RESULTS = new Set(["PASS", "PASS WITH EXPECTED LIMITATION", "BLOCKED CORRECTLY", "FAIL"]);
const ALLOWED_SEVERITIES = new Set(["critical", "high", "medium", "low"]);
const ALLOWED_DEFECT_STATUSES = new Set(["open", "resolved", "accepted-limitation"]);
const ALLOWED_DEFECT_CATEGORIES = new Set([
  "product-defect",
  "data-loss",
  "user-input",
  "document-limitation",
  "browser-platform",
  "resource-storage",
  "usability"
]);

const FORBIDDEN_KEYS = new Set([
  "password",
  "passwords",
  "document_contents",
  "document_content",
  "document_text",
  "extracted_text",
  "ocr_text",
  "screenshot",
  "screenshot_data",
  "document_bytes",
  "file_bytes",
  "filename",
  "file_name",
  "document_filename",
  "email",
  "email_address",
  "tester_name"
]);

function assertion(condition, message) {
  if (!condition) throw new Error(message);
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
    const normalized = normalizedKey(key);
    assertion(!FORBIDDEN_KEYS.has(normalized), `Privacy-sensitive field '${key}' is forbidden at ${location}`);
    scanPrivacy(child, `${location}.${key}`);
  }
}

function validateExactIdSet(entries, requiredIds, fieldName) {
  assertion(Array.isArray(entries), `${fieldName} must be an array`);
  assertion(entries.length === requiredIds.length, `${fieldName} must contain exactly ${requiredIds.length} entries`);

  const ids = entries.map((entry) => entry?.id);
  const unique = new Set(ids);
  assertion(unique.size === ids.length, `${fieldName} contains duplicate IDs`);

  for (const id of requiredIds) {
    assertion(unique.has(id), `${fieldName} is missing ${id}`);
  }
  for (const id of unique) {
    assertion(requiredIds.includes(id), `${fieldName} contains unknown ID ${String(id)}`);
  }
}

function validateString(value, fieldName) {
  assertion(typeof value === "string" && value.trim().length > 0, `${fieldName} must be a non-empty string`);
}

function validateBoolean(value, fieldName) {
  assertion(typeof value === "boolean", `${fieldName} must be boolean human evidence`);
}

export function validateSession(session) {
  assertion(session && typeof session === "object" && !Array.isArray(session), "Session must be a JSON object");
  scanPrivacy(session);

  assertion(session.schema === 1, "schema must equal 1");
  assertion(session.baseline_commit === R9_BASELINE_SHA, `baseline_commit must equal frozen R9 baseline ${R9_BASELINE_SHA}`);
  validateString(session.session_id, "session_id");
  validateString(session.tester_id, "tester_id");
  validateString(session.corpus_id, "corpus_id");

  const environment = session.environment;
  assertion(environment && typeof environment === "object" && !Array.isArray(environment), "environment must be an object");
  validateString(environment.date, "environment.date");
  validateString(environment.browser, "environment.browser");
  validateString(environment.os_device, "environment.os_device");
  validateString(environment.viewport, "environment.viewport");
  validateString(environment.build_channel, "environment.build_channel");

  validateExactIdSet(session.first_location, DISCOVERY_IDS, "first_location");
  for (const entry of session.first_location) {
    validateString(entry.first_location, `first_location.${entry.id}.first_location`);
    validateBoolean(entry.correct_first_location, `first_location.${entry.id}.correct_first_location`);
    validateBoolean(entry.help_used_before_choice, `first_location.${entry.id}.help_used_before_choice`);
    assertion(Number.isInteger(entry.meaningful_interactions) && entry.meaningful_interactions >= 0, `first_location.${entry.id}.meaningful_interactions must be a non-negative integer`);
  }

  validateExactIdSet(session.no_help_completion, COMPLETION_IDS, "no_help_completion");
  for (const entry of session.no_help_completion) {
    validateBoolean(entry.completed_without_help, `no_help_completion.${entry.id}.completed_without_help`);
    assertion(ALLOWED_RESULTS.has(entry.result), `no_help_completion.${entry.id}.result must be a final manual result`);
  }

  validateExactIdSet(session.navigation_prediction, DISCOVERY_IDS, "navigation_prediction");
  for (const entry of session.navigation_prediction) {
    validateString(entry.predicted_location, `navigation_prediction.${entry.id}.predicted_location`);
    validateBoolean(entry.matches_canonical, `navigation_prediction.${entry.id}.matches_canonical`);
  }

  assertion(Array.isArray(session.defects), "defects must be an array");
  for (const [index, defect] of session.defects.entries()) {
    assertion(defect && typeof defect === "object" && !Array.isArray(defect), `defects[${index}] must be an object`);
    assertion(ALLOWED_SEVERITIES.has(defect.severity), `defects[${index}].severity is invalid`);
    assertion(ALLOWED_DEFECT_CATEGORIES.has(defect.category), `defects[${index}].category is invalid`);
    assertion(ALLOWED_DEFECT_STATUSES.has(defect.status), `defects[${index}].status is invalid`);
    validateString(defect.description, `defects[${index}].description`);
  }

  return session;
}

function metric(numerator, denominator) {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
    target: TARGET,
    met: denominator > 0 && numerator / denominator >= TARGET
  };
}

export function summarizeSessions(rawSessions) {
  if (!rawSessions || rawSessions.length === 0) {
    return {
      status: "HUMAN_UX_UNMEASURED",
      baseline_commit: R9_BASELINE_SHA,
      sessions: 0,
      metrics: null,
      blocking_defects: []
    };
  }

  const sessions = rawSessions.map(validateSession);
  const firstCorrect = sessions.flatMap((session) => session.first_location).filter((entry) => entry.correct_first_location).length;
  const noHelpCorrect = sessions.flatMap((session) => session.no_help_completion).filter((entry) => entry.completed_without_help).length;
  const predictionCorrect = sessions.flatMap((session) => session.navigation_prediction).filter((entry) => entry.matches_canonical).length;

  const metrics = {
    first_location_accuracy: metric(firstCorrect, sessions.length * 20),
    no_help_completion: metric(noHelpCorrect, sessions.length * 10),
    navigation_prediction_accuracy: metric(predictionCorrect, sessions.length * 20)
  };

  const blockingDefects = sessions.flatMap((session) =>
    session.defects
      .filter((defect) => defect.status !== "resolved" && (defect.severity === "critical" || defect.category === "data-loss"))
      .map((defect) => ({ session_id: session.session_id, ...defect }))
  );

  const metricsMet = Object.values(metrics).every((item) => item.met);
  let status = metricsMet ? "HUMAN_UX_TARGET_MET" : "HUMAN_UX_TARGET_MISSED";
  if (blockingDefects.length > 0) status = "R9_BLOCKED_BY_PRODUCT_DEFECT";

  return {
    status,
    baseline_commit: R9_BASELINE_SHA,
    sessions: sessions.length,
    metrics,
    blocking_defects: blockingDefects
  };
}

function defaultEvidenceFiles() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "../..");
  const sessionsDir = path.join(repoRoot, "docs/reconstruction/evidence/r9/sessions");
  if (!fs.existsSync(sessionsDir)) return [];
  return fs.readdirSync(sessionsDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(sessionsDir, name));
}

function runCli() {
  const supplied = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const files = supplied.length > 0 ? supplied : defaultEvidenceFiles();

  if (files.length === 0) {
    console.log(JSON.stringify(summarizeSessions([]), null, 2));
    return;
  }

  try {
    const sessions = files.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
    const summary = summarizeSessions(sessions);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: "R9_EVIDENCE_INVALID",
      baseline_commit: R9_BASELINE_SHA,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const R9_BASELINE_SHA = "7c81f95815a3d8740fddef3d76e264ebb19c96f8";
export const TARGET = 0.9;
export const MIN_DISTINCT_TESTERS = 3;
export const MIN_LOW_FAMILIARITY_TESTERS = 2;

const DISCOVERY_IDS = Array.from({ length: 20 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`);
const COMPLETION_IDS = Array.from({ length: 10 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);
const CANONICAL_ORDER = DISCOVERY_IDS.join(",");
const COMPLETION_MAPPING = new Map([
  ["C01", "D01"],
  ["C02", "D04"],
  ["C03", "D05"],
  ["C04", "D06"],
  ["C05", "D07"],
  ["C06", "D10"],
  ["C07", "D14"],
  ["C08", "D15"],
  ["C09", "D18"],
  ["C10", "D19"]
]);

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
const ALLOWED_FAMILIARITY = new Set(["none", "light", "experienced"]);
const ALLOWED_PDF_EXPERIENCE = new Set(["basic", "regular", "advanced"]);

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

  for (const id of requiredIds) assertion(unique.has(id), `${fieldName} is missing ${id}`);
  for (const id of unique) assertion(requiredIds.includes(id), `${fieldName} contains unknown ID ${String(id)}`);
}

function validateMeasurementOrder(order) {
  assertion(Array.isArray(order), "measurement_order must be an array");
  assertion(order.length === DISCOVERY_IDS.length, `measurement_order must contain exactly ${DISCOVERY_IDS.length} IDs`);
  const unique = new Set(order);
  assertion(unique.size === order.length, "measurement_order contains duplicate IDs");
  for (const id of DISCOVERY_IDS) assertion(unique.has(id), `measurement_order is missing ${id}`);
  for (const id of unique) assertion(DISCOVERY_IDS.includes(id), `measurement_order contains unknown ID ${String(id)}`);
  assertion(order.join(",") !== CANONICAL_ORDER, "measurement_order must be shuffled rather than canonical sorted order");
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

  assertion(session.schema === 2, "schema must equal 2");
  assertion(session.baseline_commit === R9_BASELINE_SHA, `baseline_commit must equal frozen R9 baseline ${R9_BASELINE_SHA}`);
  validateString(session.session_id, "session_id");
  validateString(session.tester_id, "tester_id");
  validateString(session.corpus_id, "corpus_id");

  const testerProfile = session.tester_profile;
  assertion(testerProfile && typeof testerProfile === "object" && !Array.isArray(testerProfile), "tester_profile must be an object");
  assertion(ALLOWED_FAMILIARITY.has(testerProfile.familiarity), "tester_profile.familiarity is invalid");
  assertion(ALLOWED_PDF_EXPERIENCE.has(testerProfile.pdf_experience), "tester_profile.pdf_experience is invalid");

  const environment = session.environment;
  assertion(environment && typeof environment === "object" && !Array.isArray(environment), "environment must be an object");
  validateString(environment.date, "environment.date");
  validateString(environment.browser, "environment.browser");
  validateString(environment.os_device, "environment.os_device");
  validateString(environment.viewport, "environment.viewport");
  validateString(environment.build_channel, "environment.build_channel");

  validateMeasurementOrder(session.measurement_order);

  validateExactIdSet(session.first_location, DISCOVERY_IDS, "first_location");
  for (const entry of session.first_location) {
    validateString(entry.first_location, `first_location.${entry.id}.first_location`);
    validateBoolean(entry.correct_first_location, `first_location.${entry.id}.correct_first_location`);
    validateBoolean(entry.help_used_before_choice, `first_location.${entry.id}.help_used_before_choice`);
    assertion(Number.isInteger(entry.meaningful_interactions) && entry.meaningful_interactions >= 0, `first_location.${entry.id}.meaningful_interactions must be a non-negative integer`);
  }

  validateExactIdSet(session.no_help_completion, COMPLETION_IDS, "no_help_completion");
  for (const entry of session.no_help_completion) {
    assertion(entry.measured_during === COMPLETION_MAPPING.get(entry.id), `no_help_completion.${entry.id}.measured_during must equal ${COMPLETION_MAPPING.get(entry.id)}`);
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

function sessionMetrics(session) {
  const firstCorrect = session.first_location.filter((entry) => entry.correct_first_location).length;
  const noHelpCorrect = session.no_help_completion.filter((entry) => entry.completed_without_help).length;
  const predictionCorrect = session.navigation_prediction.filter((entry) => entry.matches_canonical).length;
  return {
    session_id: session.session_id,
    tester_id: session.tester_id,
    first_location_accuracy: metric(firstCorrect, 20),
    no_help_completion: metric(noHelpCorrect, 10),
    navigation_prediction_accuracy: metric(predictionCorrect, 20)
  };
}

export function summarizeSessions(rawSessions) {
  if (!rawSessions || rawSessions.length === 0) {
    return {
      status: "HUMAN_UX_UNMEASURED",
      baseline_commit: R9_BASELINE_SHA,
      sessions: 0,
      sample: {
        distinct_testers: 0,
        low_familiarity_testers: 0,
        minimum_distinct_testers: MIN_DISTINCT_TESTERS,
        minimum_low_familiarity_testers: MIN_LOW_FAMILIARITY_TESTERS,
        sufficient: false
      },
      metrics: null,
      session_metrics: [],
      blocking_defects: []
    };
  }

  const sessions = rawSessions.map(validateSession);
  const sessionIds = sessions.map((session) => session.session_id);
  assertion(new Set(sessionIds).size === sessionIds.length, "Evidence contains duplicate session_id values");

  const profileByTester = new Map();
  for (const session of sessions) {
    const existing = profileByTester.get(session.tester_id);
    if (existing) {
      assertion(existing.familiarity === session.tester_profile.familiarity, `tester_id ${session.tester_id} has inconsistent familiarity across sessions`);
      assertion(existing.pdf_experience === session.tester_profile.pdf_experience, `tester_id ${session.tester_id} has inconsistent pdf_experience across sessions`);
    } else {
      profileByTester.set(session.tester_id, session.tester_profile);
    }
  }

  const distinctTesters = profileByTester.size;
  const lowFamiliarityTesters = [...profileByTester.values()].filter((profile) => profile.familiarity === "none" || profile.familiarity === "light").length;
  const sampleSufficient = distinctTesters >= MIN_DISTINCT_TESTERS && lowFamiliarityTesters >= MIN_LOW_FAMILIARITY_TESTERS;

  const perSession = sessions.map(sessionMetrics);
  const perSessionTargetsMet = perSession.every((item) =>
    item.first_location_accuracy.met && item.no_help_completion.met && item.navigation_prediction_accuracy.met
  );

  const firstCorrect = sessions.flatMap((session) => session.first_location).filter((entry) => entry.correct_first_location).length;
  const noHelpCorrect = sessions.flatMap((session) => session.no_help_completion).filter((entry) => entry.completed_without_help).length;
  const predictionCorrect = sessions.flatMap((session) => session.navigation_prediction).filter((entry) => entry.matches_canonical).length;

  const metrics = {
    first_location_accuracy: metric(firstCorrect, sessions.length * 20),
    no_help_completion: metric(noHelpCorrect, sessions.length * 10),
    navigation_prediction_accuracy: metric(predictionCorrect, sessions.length * 20)
  };
  const aggregateTargetsMet = Object.values(metrics).every((item) => item.met);

  const blockingDefects = sessions.flatMap((session) =>
    session.defects
      .filter((defect) => defect.status !== "resolved" && (defect.severity === "critical" || defect.category === "data-loss"))
      .map((defect) => ({ session_id: session.session_id, tester_id: session.tester_id, ...defect }))
  );

  let status;
  if (blockingDefects.length > 0) status = "R9_BLOCKED_BY_PRODUCT_DEFECT";
  else if (!perSessionTargetsMet || !aggregateTargetsMet) status = "HUMAN_UX_TARGET_MISSED";
  else if (!sampleSufficient) status = "HUMAN_UX_SAMPLE_INSUFFICIENT";
  else status = "HUMAN_UX_TARGET_MET";

  return {
    status,
    baseline_commit: R9_BASELINE_SHA,
    sessions: sessions.length,
    sample: {
      distinct_testers: distinctTesters,
      low_familiarity_testers: lowFamiliarityTesters,
      minimum_distinct_testers: MIN_DISTINCT_TESTERS,
      minimum_low_familiarity_testers: MIN_LOW_FAMILIARITY_TESTERS,
      sufficient: sampleSufficient
    },
    metrics,
    session_metrics: perSession,
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
    console.log(JSON.stringify(summarizeSessions(sessions), null, 2));
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

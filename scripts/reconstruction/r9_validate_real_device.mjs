#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  R9_BASELINE_SHA,
  blockingDefectsFor,
  scanPrivacy,
  validateDefects,
  validatePhysicalEnvironment,
  validateString
} from "./r9_validate_evidence.mjs";

export const P43_DEVICE_RUN_SCHEMA = 1;
export const JOURNEY_IDS = Array.from({ length: 10 }, (_, index) => `J${String(index + 1).padStart(2, "0")}`);
const ALLOWED_RESULTS = new Set(["PASS", "PASS WITH EXPECTED LIMITATION", "BLOCKED CORRECTLY", "FAIL", "NOT_RUN"]);
const QUALIFYING_RESULTS = new Set(["PASS", "PASS WITH EXPECTED LIMITATION"]);

export const REQUIRED_DEVICE_SLOTS = [
  {
    id: "windows-chromium-desktop",
    label: "Windows desktop/laptop + Chromium-family browser",
    match: (environment) => environment.os_family === "windows"
      && (environment.device_class === "desktop" || environment.device_class === "laptop")
      && environment.browser_family === "chromium"
      && (environment.input_mode === "keyboard-mouse" || environment.input_mode === "keyboard-trackpad")
  },
  {
    id: "macos-safari-desktop",
    label: "macOS desktop/laptop + Safari",
    match: (environment) => environment.os_family === "macos"
      && (environment.device_class === "desktop" || environment.device_class === "laptop")
      && environment.browser_family === "safari-webkit"
      && /safari/i.test(environment.browser_name)
      && (environment.input_mode === "keyboard-mouse" || environment.input_mode === "keyboard-trackpad")
  },
  {
    id: "android-chromium-phone",
    label: "Android phone + Chromium-family browser",
    match: (environment) => environment.os_family === "android"
      && environment.device_class === "phone"
      && environment.browser_family === "chromium"
      && (environment.input_mode === "touch" || environment.input_mode === "touch-keyboard")
  },
  {
    id: "ios-safari-phone",
    label: "iPhone/iOS + Safari",
    match: (environment) => environment.os_family === "ios"
      && environment.device_class === "phone"
      && environment.browser_family === "safari-webkit"
      && /safari/i.test(environment.browser_name)
      && (environment.input_mode === "touch" || environment.input_mode === "touch-keyboard")
  },
  {
    id: "ipados-safari-tablet",
    label: "iPadOS tablet + Safari",
    match: (environment) => environment.os_family === "ipados"
      && environment.device_class === "tablet"
      && environment.browser_family === "safari-webkit"
      && /safari/i.test(environment.browser_name)
      && (environment.input_mode === "touch" || environment.input_mode === "touch-keyboard")
  }
];

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function validateExactJourneys(entries) {
  assertion(Array.isArray(entries), "journey_results must be an array");
  assertion(entries.length === JOURNEY_IDS.length, `journey_results must contain exactly ${JOURNEY_IDS.length} entries`);
  const ids = entries.map((entry) => entry?.id);
  assertion(new Set(ids).size === ids.length, "journey_results contains duplicate IDs");
  for (const id of JOURNEY_IDS) assertion(ids.includes(id), `journey_results is missing ${id}`);
  for (const id of ids) assertion(JOURNEY_IDS.includes(id), `journey_results contains unknown ID ${String(id)}`);
}

export function validateRealDeviceRun(run) {
  assertion(run && typeof run === "object" && !Array.isArray(run), "Real-device run must be a JSON object");
  scanPrivacy(run);
  assertion(run.schema === P43_DEVICE_RUN_SCHEMA, `schema must equal ${P43_DEVICE_RUN_SCHEMA}`);
  assertion(run.baseline_commit === R9_BASELINE_SHA, `baseline_commit must equal frozen R9/P43 baseline ${R9_BASELINE_SHA}`);
  validateString(run.run_id, "run_id");
  validateString(run.tester_id, "tester_id");
  validateString(run.corpus_id, "corpus_id");
  validatePhysicalEnvironment(run.environment);
  validateExactJourneys(run.journey_results);

  for (const entry of run.journey_results) {
    assertion(ALLOWED_RESULTS.has(entry.result), `journey_results.${entry.id}.result is invalid`);
  }

  validateDefects(run.defects);
  return run;
}

function slotCoverage(runs) {
  return REQUIRED_DEVICE_SLOTS.map((slot) => {
    const matched = runs.filter((run) => slot.match(run.environment));
    return {
      id: slot.id,
      label: slot.label,
      covered: matched.length > 0,
      run_ids: matched.map((run) => run.run_id).sort()
    };
  });
}

function journeyCoverage(runs) {
  return JOURNEY_IDS.map((id) => {
    const qualifying = runs.filter((run) => run.journey_results.some((entry) => entry.id === id && QUALIFYING_RESULTS.has(entry.result)));
    const failures = runs.filter((run) => run.journey_results.some((entry) => entry.id === id && entry.result === "FAIL"));
    return {
      id,
      covered: qualifying.length > 0,
      qualifying_run_ids: qualifying.map((run) => run.run_id).sort(),
      failing_run_ids: failures.map((run) => run.run_id).sort()
    };
  });
}

export function summarizeRealDeviceRuns(rawRuns) {
  if (!rawRuns || rawRuns.length === 0) {
    return {
      status: "REAL_DEVICE_UNMEASURED",
      baseline_commit: R9_BASELINE_SHA,
      runs: 0,
      matrix: {
        required_slots: REQUIRED_DEVICE_SLOTS.length,
        covered_slots: 0,
        sufficient: false,
        slots: slotCoverage([])
      },
      journeys: {
        required: JOURNEY_IDS.length,
        covered: 0,
        sufficient: false,
        items: journeyCoverage([])
      },
      installed_pwa_covered: false,
      blocking_defects: []
    };
  }

  const runs = rawRuns.map(validateRealDeviceRun);
  const runIds = runs.map((run) => run.run_id);
  assertion(new Set(runIds).size === runIds.length, "Real-device evidence contains duplicate run_id values");

  const slots = slotCoverage(runs);
  const journeys = journeyCoverage(runs);
  const matrixSufficient = slots.every((slot) => slot.covered);
  const journeySufficient = journeys.every((journey) => journey.covered);
  const installedPwaCovered = runs.some((run) => run.environment.app_mode === "installed-pwa"
    && run.journey_results.some((entry) => entry.id === "J10" && QUALIFYING_RESULTS.has(entry.result)));
  const blockingDefects = blockingDefectsFor(runs, "run_id");
  const measuredFailures = runs.flatMap((run) => run.journey_results
    .filter((entry) => entry.result === "FAIL")
    .map((entry) => ({ run_id: run.run_id, tester_id: run.tester_id, journey_id: entry.id })));

  let status;
  if (blockingDefects.length > 0) status = "REAL_DEVICE_BLOCKED_BY_PRODUCT_DEFECT";
  else if (measuredFailures.length > 0) status = "REAL_DEVICE_TARGET_MISSED";
  else if (!matrixSufficient || !journeySufficient || !installedPwaCovered) status = "REAL_DEVICE_MATRIX_INCOMPLETE";
  else status = "REAL_DEVICE_TARGET_MET";

  return {
    status,
    baseline_commit: R9_BASELINE_SHA,
    runs: runs.length,
    distinct_testers: new Set(runs.map((run) => run.tester_id)).size,
    matrix: {
      required_slots: REQUIRED_DEVICE_SLOTS.length,
      covered_slots: slots.filter((slot) => slot.covered).length,
      sufficient: matrixSufficient,
      slots
    },
    journeys: {
      required: JOURNEY_IDS.length,
      covered: journeys.filter((journey) => journey.covered).length,
      sufficient: journeySufficient,
      items: journeys
    },
    installed_pwa_covered: installedPwaCovered,
    measured_failures: measuredFailures,
    blocking_defects: blockingDefects
  };
}

export function defaultRealDeviceFiles(repoRoot = null) {
  const root = repoRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const runsDir = path.join(root, "docs/reconstruction/evidence/r9/device-runs");
  if (!fs.existsSync(runsDir)) return [];
  return fs.readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(runsDir, name));
}

function runCli() {
  const supplied = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const files = supplied.length > 0 ? supplied : defaultRealDeviceFiles();
  if (files.length === 0) {
    console.log(JSON.stringify(summarizeRealDeviceRuns([]), null, 2));
    return;
  }

  try {
    const runs = files.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(JSON.stringify(summarizeRealDeviceRuns(runs), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: "REAL_DEVICE_EVIDENCE_INVALID",
      baseline_commit: R9_BASELINE_SHA,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

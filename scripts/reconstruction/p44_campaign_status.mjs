#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIN_DISTINCT_TESTERS,
  MIN_LOW_FAMILIARITY_TESTERS,
  R9_BASELINE_SHA,
  defaultEvidenceFiles,
  summarizeSessions
} from "./r9_validate_evidence.mjs";
import {
  JOURNEY_IDS,
  REQUIRED_DEVICE_SLOTS,
  defaultRealDeviceFiles,
  summarizeRealDeviceRuns
} from "./r9_validate_real_device.mjs";

const HUMAN_TARGET = 0.9;
const CERTIFICATION_STATUS = "R9_HUMAN_USABILITY_CERTIFIED";

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function exactSet(actual, expected, field) {
  assertion(Array.isArray(actual), `${field} must be an array`);
  assertion(actual.length === expected.length, `${field} must contain exactly ${expected.length} entries`);
  const actualSet = new Set(actual);
  assertion(actualSet.size === actual.length, `${field} contains duplicate entries`);
  for (const item of expected) assertion(actualSet.has(item), `${field} is missing ${item}`);
  for (const item of actualSet) assertion(expected.includes(item), `${field} contains unknown entry ${String(item)}`);
}

export function validateCampaignPlan(plan) {
  assertion(plan && typeof plan === "object" && !Array.isArray(plan), "P44 campaign plan must be an object");
  assertion(plan.schema === 1, "P44 campaign plan schema must equal 1");
  assertion(plan.phase === "P44", "P44 campaign plan phase must equal P44");
  assertion(plan.product_baseline_commit === R9_BASELINE_SHA, "P44 campaign plan baseline must equal the frozen P43/R9 product baseline");

  const human = plan.human_requirements;
  assertion(human && typeof human === "object" && !Array.isArray(human), "human_requirements must be an object");
  assertion(human.minimum_distinct_testers === MIN_DISTINCT_TESTERS, `minimum_distinct_testers must equal ${MIN_DISTINCT_TESTERS}`);
  assertion(human.minimum_low_familiarity_testers === MIN_LOW_FAMILIARITY_TESTERS, `minimum_low_familiarity_testers must equal ${MIN_LOW_FAMILIARITY_TESTERS}`);
  assertion(human.individual_metric_target === HUMAN_TARGET, `individual_metric_target must equal ${HUMAN_TARGET}`);
  assertion(human.aggregate_metric_target === HUMAN_TARGET, `aggregate_metric_target must equal ${HUMAN_TARGET}`);

  exactSet(plan.required_device_slots, REQUIRED_DEVICE_SLOTS.map((slot) => slot.id), "required_device_slots");
  exactSet(plan.required_journeys, JOURNEY_IDS, "required_journeys");
  assertion(plan.installed_pwa_recovery_journey === "J10", "installed_pwa_recovery_journey must equal J10");
  exactSet(plan.certification_requires, ["HUMAN_UX_TARGET_MET", "REAL_DEVICE_TARGET_MET"], "certification_requires");

  const policy = plan.evidence_policy;
  assertion(policy && typeof policy === "object" && !Array.isArray(policy), "evidence_policy must be an object");
  assertion(policy.human_physical_device_only === true, "human_physical_device_only must be true");
  assertion(policy.automation_may_generate_observations === false, "automation_may_generate_observations must be false");
  assertion(policy.placeholder_evidence_allowed === false, "placeholder_evidence_allowed must be false");
  assertion(policy.failed_observations_must_be_preserved === true, "failed_observations_must_be_preserved must be true");
  return plan;
}

function shortfall(required, actual) {
  return Math.max(0, required - actual);
}

function certificationValid(certification) {
  if (!certification) return false;
  return certification.schema === 1
    && certification.status === CERTIFICATION_STATUS
    && certification.product_baseline_commit === R9_BASELINE_SHA
    && certification.human_ux_status === "HUMAN_UX_TARGET_MET"
    && certification.real_device_status === "REAL_DEVICE_TARGET_MET";
}

export function buildCampaignStatus({ plan, humanSummary, deviceSummary, certification = null }) {
  validateCampaignPlan(plan);
  assertion(humanSummary && typeof humanSummary === "object", "humanSummary is required");
  assertion(deviceSummary && typeof deviceSummary === "object", "deviceSummary is required");

  const missingDistinctTesters = shortfall(MIN_DISTINCT_TESTERS, humanSummary.sample?.distinct_testers ?? 0);
  const missingLowFamiliarityTesters = shortfall(MIN_LOW_FAMILIARITY_TESTERS, humanSummary.sample?.low_familiarity_testers ?? 0);
  const missingDeviceSlots = (deviceSummary.matrix?.slots ?? []).filter((slot) => !slot.covered).map((slot) => slot.id);
  const missingJourneys = (deviceSummary.journeys?.items ?? []).filter((journey) => !journey.covered).map((journey) => journey.id);
  const installedPwaMissing = deviceSummary.installed_pwa_covered !== true;
  const blockingDefects = [
    ...(humanSummary.blocking_defects ?? []).map((item) => ({ source: "human-session", ...item })),
    ...(deviceSummary.blocking_defects ?? []).map((item) => ({ source: "device-run", ...item }))
  ];

  const humanTargetMissed = humanSummary.status === "HUMAN_UX_TARGET_MISSED" || humanSummary.status === "R9_BLOCKED_BY_PRODUCT_DEFECT";
  const deviceTargetMissed = deviceSummary.status === "REAL_DEVICE_TARGET_MISSED" || deviceSummary.status === "REAL_DEVICE_BLOCKED_BY_PRODUCT_DEFECT";
  const certified = certificationValid(certification);
  const bothTargetsMet = humanSummary.status === "HUMAN_UX_TARGET_MET" && deviceSummary.status === "REAL_DEVICE_TARGET_MET";

  let status;
  if (blockingDefects.length > 0 || humanTargetMissed || deviceTargetMissed) status = "P44_CAMPAIGN_BLOCKED";
  else if (certification && !certified) status = "P44_CAMPAIGN_BLOCKED";
  else if (certified) status = "P44_CAMPAIGN_CERTIFIED";
  else if (bothTargetsMet) status = "P44_CAMPAIGN_READY_TO_CERTIFY";
  else if ((humanSummary.sessions ?? 0) === 0 && (deviceSummary.runs ?? 0) === 0) status = "P44_CAMPAIGN_READY_FOR_FIELDWORK";
  else status = "P44_CAMPAIGN_IN_PROGRESS";

  const nextActions = [];
  if (status === "P44_CAMPAIGN_BLOCKED") {
    nextActions.push("Preserve failed evidence and triage blocking or target-miss findings before rerunning affected observations.");
  } else if (status === "P44_CAMPAIGN_CERTIFIED") {
    nextActions.push("Proceed to the separately qualified R10 product-baseline promotion for the P42 consumer baseline.");
  } else if (status === "P44_CAMPAIGN_READY_TO_CERTIFY") {
    nextActions.push("Run scripts/reconstruction/r9_certify_evidence.mjs and commit the digest-backed R9 certification record.");
  } else {
    if (missingDistinctTesters > 0) {
      nextActions.push(`Complete ${missingDistinctTesters} additional full human session(s) with distinct tester IDs.`);
    }
    if (missingLowFamiliarityTesters > 0) {
      nextActions.push(`Ensure ${missingLowFamiliarityTesters} additional qualifying tester(s) have none/light prior PDF Studio familiarity.`);
    }
    for (const slot of missingDeviceSlots) nextActions.push(`Complete a qualifying physical-device run for ${slot}.`);
    if (missingJourneys.length > 0) nextActions.push(`Cover missing real-device journeys: ${missingJourneys.join(", ")}.`);
    if (installedPwaMissing) nextActions.push("Complete J10 successfully in installed-PWA mode on a physical supported device.");
  }

  return {
    schema: 1,
    phase: "P44",
    status,
    product_baseline_commit: R9_BASELINE_SHA,
    human: {
      status: humanSummary.status,
      sessions: humanSummary.sessions ?? 0,
      distinct_testers: humanSummary.sample?.distinct_testers ?? 0,
      low_familiarity_testers: humanSummary.sample?.low_familiarity_testers ?? 0,
      missing_distinct_testers: missingDistinctTesters,
      missing_low_familiarity_testers: missingLowFamiliarityTesters,
      metrics: humanSummary.metrics ?? null
    },
    real_device: {
      status: deviceSummary.status,
      runs: deviceSummary.runs ?? 0,
      covered_slots: deviceSummary.matrix?.covered_slots ?? 0,
      required_slots: deviceSummary.matrix?.required_slots ?? REQUIRED_DEVICE_SLOTS.length,
      missing_slots: missingDeviceSlots,
      covered_journeys: deviceSummary.journeys?.covered ?? 0,
      required_journeys: deviceSummary.journeys?.required ?? JOURNEY_IDS.length,
      missing_journeys: missingJourneys,
      installed_pwa_recovery_covered: !installedPwaMissing
    },
    blocking_defects: blockingDefects,
    certification: {
      present: certification !== null,
      valid: certified
    },
    next_actions: nextActions
  };
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadMany(files) {
  return files.map(loadJson);
}

function parseArgs(argv) {
  let plan = null;
  let expectStatus = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--plan") {
      plan = argv[index + 1];
      if (!plan) throw new Error("--plan requires a path");
      index += 1;
    } else if (token === "--expect-status") {
      expectStatus = argv[index + 1];
      if (!expectStatus) throw new Error("--expect-status requires a value");
      index += 1;
    } else {
      throw new Error(`unknown argument ${token}`);
    }
  }
  return { plan, expectStatus };
}

function runCli() {
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(scriptDir, "../..");
    const { plan: suppliedPlan, expectStatus } = parseArgs(process.argv.slice(2));
    const planPath = path.resolve(suppliedPlan || path.join(repoRoot, "docs/reconstruction/p44-qualification-campaign-plan.json"));
    const certificationPath = path.join(repoRoot, "docs/reconstruction/evidence/r9/certification.json");

    const plan = loadJson(planPath);
    const humanSummary = summarizeSessions(loadMany(defaultEvidenceFiles(repoRoot)));
    const deviceSummary = summarizeRealDeviceRuns(loadMany(defaultRealDeviceFiles(repoRoot)));
    const certification = fs.existsSync(certificationPath) ? loadJson(certificationPath) : null;
    const result = buildCampaignStatus({ plan, humanSummary, deviceSummary, certification });

    console.log(JSON.stringify(result, null, 2));
    if (expectStatus && result.status !== expectStatus) {
      console.error(`Expected ${expectStatus} but received ${result.status}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify({
      status: "P44_CAMPAIGN_STATUS_INVALID",
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

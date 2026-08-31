#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  R9_BASELINE_SHA,
  defaultEvidenceFiles,
  summarizeSessions
} from "./r9_validate_evidence.mjs";
import {
  defaultRealDeviceFiles,
  summarizeRealDeviceRuns
} from "./r9_validate_real_device.mjs";
import { buildCampaignStatus } from "./p44_campaign_status.mjs";

const STATE_BY_CAMPAIGN = new Map([
  ["P44_CAMPAIGN_READY_FOR_FIELDWORK", "OPEN_NO_EVIDENCE"],
  ["P44_CAMPAIGN_IN_PROGRESS", "IN_PROGRESS"],
  ["P44_CAMPAIGN_BLOCKED", "BLOCKED"],
  ["P44_CAMPAIGN_READY_TO_CERTIFY", "READY_TO_CERTIFY"],
  ["P44_CAMPAIGN_CERTIFIED", "CERTIFIED"]
]);

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function sha(value, field) {
  assertion(typeof value === "string" && /^[0-9a-f]{40}$/.test(value), `${field} must be a 40-character lowercase Git SHA`);
}

function httpsUrl(value, field) {
  assertion(typeof value === "string" && value.startsWith("https://") && value.endsWith("/"), `${field} must be an HTTPS URL ending in /`);
}

export function validateFieldHost(config, campaignStatus) {
  assertion(config && typeof config === "object" && !Array.isArray(config), "P45 field host config must be an object");
  assertion(config.schema === 1, "P45 field host schema must equal 1");
  assertion(config.phase === "P45", "P45 field host phase must equal P45");
  assertion(typeof config.active === "boolean", "active must be boolean");
  assertion(config.product_baseline_commit === R9_BASELINE_SHA, "P45 field host baseline must equal the frozen P42/R9 baseline");
  sha(config.product_baseline_commit, "product_baseline_commit");
  sha(config.stable_tag_commit, "stable_tag_commit");
  assertion(config.stable_version === "7.0.0", "stable_version must equal the currently published Stable version 7.0.0");
  assertion(config.stable_tag === `v${config.stable_version}`, "stable_tag must match stable_version");
  httpsUrl(config.stable_page_url, "stable_page_url");
  httpsUrl(config.qualification_url, "qualification_url");
  assertion(typeof config.qualification_path === "string" && /^[a-z0-9][a-z0-9/_-]*$/.test(config.qualification_path), "qualification_path is invalid");
  assertion(!config.qualification_path.startsWith("/") && !config.qualification_path.endsWith("/"), "qualification_path must be relative without leading/trailing slash");
  assertion(config.qualification_url === `${config.stable_page_url}${config.qualification_path}/`, "qualification_url must equal stable_page_url + qualification_path");
  assertion(config.root_preservation_contract === "live-release-integrity-byte-match", "root_preservation_contract must remain fail-closed");
  assertion(config.observation_policy === "human-physical-device-only", "observation_policy must remain human-physical-device-only");

  assertion(campaignStatus && typeof campaignStatus === "object", "P44 campaign status is required");
  const expectedState = STATE_BY_CAMPAIGN.get(campaignStatus.status);
  assertion(expectedState, `Unsupported P44 campaign status ${String(campaignStatus.status)}`);
  assertion(config.fieldwork_state === expectedState, `fieldwork_state must be ${expectedState} while campaign status is ${campaignStatus.status}`);
  if (expectedState === "CERTIFIED") assertion(config.active === false, "Certified fieldwork host must be deactivated");
  else assertion(config.active === true, "Uncertified fieldwork host must remain active while fieldwork is open");

  return {
    schema: 1,
    phase: "P45",
    status: expectedState === "OPEN_NO_EVIDENCE"
      ? "P45_FIELDWORK_READY"
      : expectedState === "IN_PROGRESS"
        ? "P45_FIELDWORK_IN_PROGRESS"
        : expectedState === "BLOCKED"
          ? "P45_FIELDWORK_BLOCKED"
          : expectedState === "READY_TO_CERTIFY"
            ? "P45_FIELDWORK_READY_TO_CERTIFY"
            : "P45_FIELDWORK_CERTIFIED",
    fieldwork_state: config.fieldwork_state,
    active: config.active,
    stable_page_url: config.stable_page_url,
    qualification_url: config.qualification_url,
    product_baseline_commit: config.product_baseline_commit,
    campaign_status: campaignStatus.status,
    human_sessions: campaignStatus.human?.sessions ?? 0,
    device_runs: campaignStatus.real_device?.runs ?? 0,
    next_actions: campaignStatus.next_actions ?? []
  };
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadMany(files) {
  return files.map(loadJson);
}

function runCli() {
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(scriptDir, "../..");
    const configPath = path.join(repoRoot, "docs/reconstruction/evidence/p45/field-host.json");
    const planPath = path.join(repoRoot, "docs/reconstruction/p44-qualification-campaign-plan.json");
    const certificationPath = path.join(repoRoot, "docs/reconstruction/evidence/r9/certification.json");
    const plan = loadJson(planPath);
    const humanSummary = summarizeSessions(loadMany(defaultEvidenceFiles(repoRoot)));
    const deviceSummary = summarizeRealDeviceRuns(loadMany(defaultRealDeviceFiles(repoRoot)));
    const certification = fs.existsSync(certificationPath) ? loadJson(certificationPath) : null;
    const campaignStatus = buildCampaignStatus({ plan, humanSummary, deviceSummary, certification });
    const result = validateFieldHost(loadJson(configPath), campaignStatus);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: "P45_FIELDWORK_CONTRACT_INVALID",
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

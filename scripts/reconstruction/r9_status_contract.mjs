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

const PREVIOUS_OPERATIONAL_BASELINE = "7c81f95815a3d8740fddef3d76e264ebb19c96f8";

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadJsonFiles(files) {
  return files.map(readJson);
}

export function expectedQualificationStatus({ humanSummary, deviceSummary, certificationPresent }) {
  let certificationStatus = "NOT_CERTIFIED";
  if (certificationPresent) {
    assertion(humanSummary.status === "HUMAN_UX_TARGET_MET", "Certification exists but human UX target is not met");
    assertion(deviceSummary.status === "REAL_DEVICE_TARGET_MET", "Certification exists but real-device target is not met");
    certificationStatus = "CERTIFIED";
  } else if (humanSummary.status === "HUMAN_UX_TARGET_MET" && deviceSummary.status === "REAL_DEVICE_TARGET_MET") {
    certificationStatus = "READY_TO_CERTIFY";
  }

  return {
    schema: 1,
    phase: "P43",
    product_baseline_commit: R9_BASELINE_SHA,
    current_operational_baseline_commit: PREVIOUS_OPERATIONAL_BASELINE,
    human_ux_status: humanSummary.status,
    real_device_status: deviceSummary.status,
    certification_status: certificationStatus
  };
}

function runCli() {
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(scriptDir, "../..");
    const evidenceRoot = path.join(repoRoot, "docs/reconstruction/evidence/r9");
    const qualificationBaselinePath = path.join(evidenceRoot, "qualification-baseline.json");
    const statusPath = path.join(evidenceRoot, "status.json");
    const certificationPath = path.join(evidenceRoot, "certification.json");

    const qualificationBaseline = readJson(qualificationBaselinePath);
    assertion(qualificationBaseline.schema === 1, "qualification baseline schema must equal 1");
    assertion(qualificationBaseline.product_baseline_commit === R9_BASELINE_SHA, "qualification baseline must equal the frozen P43 product baseline");
    assertion(qualificationBaseline.previous_operational_baseline_commit === PREVIOUS_OPERATIONAL_BASELINE, "qualification baseline previous operational commit is invalid");
    assertion(qualificationBaseline.status === "AWAITING_HUMAN_REAL_DEVICE_EVIDENCE", "qualification baseline status must remain awaiting evidence until promotion");

    const humanSummary = summarizeSessions(loadJsonFiles(defaultEvidenceFiles(repoRoot)));
    const deviceSummary = summarizeRealDeviceRuns(loadJsonFiles(defaultRealDeviceFiles(repoRoot)));
    const certificationPresent = fs.existsSync(certificationPath);
    const expected = expectedQualificationStatus({ humanSummary, deviceSummary, certificationPresent });
    const committed = readJson(statusPath);

    assertion(JSON.stringify(committed) === JSON.stringify(expected), `Committed P43 status does not match measured evidence. Expected ${JSON.stringify(expected)}`);

    console.log(JSON.stringify({
      status: "P43_QUALIFICATION_STATUS_VALID",
      qualification: expected,
      human_sessions: humanSummary.sessions,
      real_device_runs: deviceSummary.runs
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: "P43_QUALIFICATION_STATUS_INVALID",
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

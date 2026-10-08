#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const P18_PRODUCT_BASELINE = "4eadaafe24a17dbdb8729849792c9b8c2817d0f3";
export const P18_BUILD_CHANNEL = "p18-v72-frozen-baseline";
export const REAL_WORLD_CATEGORIES = ["malformed","scanned","form-heavy","encrypted","signed","multilingual","large"];
export const WORKFLOW_IDS = ["W01","W02","W03","W04","W05","W06"];
export const OUTPUT_WORKFLOW_IDS = ["W01","W02","W03","W04","W05"];

const QUALIFYING = new Set(["PASS","PASS WITH EXPECTED LIMITATION"]);
const HUMAN_RESULTS = new Set(["PASS","PASS WITH EXPECTED LIMITATION","BLOCKED CORRECTLY","FAIL","NOT_RUN"]);
const REAL_WORLD_RESULTS = new Set(["PASS","PASS WITH EXPECTED LIMITATION","BLOCKED CORRECTLY","FAIL","NOT_RUN"]);
const CHECK_RESULTS = new Set(["PASS","PASS WITH EXPECTED LIMITATION","FAIL","NOT_RUN"]);
const ORIGINS = new Set(["public","sanitized-nonpersonal","private-local-not-committed"]);
const PDF_READERS = new Set(["adobe-acrobat","macos-preview","pdf24","chromium-pdf","edge-pdf","android-native","ios-quicklook","other-pdf"]);
const NATIVE_PDF_READERS = new Set(["adobe-acrobat","macos-preview","pdf24","android-native","ios-quicklook"]);
const OFFICE_READERS = new Set(["microsoft-word","libreoffice-writer","apple-pages","other-office"]);
const DEVICE_CLASSES = new Set(["desktop","laptop","phone","tablet"]);
const OS_FAMILIES = new Set(["windows","macos","linux","android","ios","ipados"]);
const BROWSER_FAMILIES = new Set(["chromium","safari-webkit","firefox"]);
const INPUT_MODES = new Set(["keyboard-mouse","keyboard-trackpad","touch","touch-keyboard"]);
const APP_MODES = new Set(["browser","installed-pwa"]);
const DEFECT_SEVERITIES = new Set(["critical","high","medium","low"]);
const DEFECT_CATEGORIES = new Set(["compatibility","data-loss","product-defect","document-limitation","reader","device","pwa","workflow"]);
const DEFECT_STATUSES = new Set(["open","resolved","accepted-limitation"]);
const AUTOMATION_MARKERS = /\b(playwright|puppeteer|selenium|simulator|emulator|github actions|ci runner|chatgpt|ai[- ]generated|synthetic observation)\b/i;
const FORBIDDEN_KEYS = new Set([
  "password","passwords","filename","file_name","document_filename","document_text","document_contents",
  "document_content","extracted_text","ocr_text","document_bytes","file_bytes","email","email_address",
  "tester_name","device_serial","serial_number","screenshot","screenshot_data"
]);

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(value) {
  return String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function scanPrivacy(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item,index) => scanPrivacy(item, `${location}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key,child] of Object.entries(value)) {
    assertion(!FORBIDDEN_KEYS.has(normalizedKey(key)), `Privacy-sensitive field '${key}' is forbidden at ${location}`);
    scanPrivacy(child, `${location}.${key}`);
  }
}

function nonempty(value, field) {
  assertion(typeof value === "string" && value.trim().length > 0, `${field} must be a non-empty string`);
}

function version(value, field) {
  nonempty(value, field);
  assertion(/\d/.test(value), `${field} must include an exact version number`);
}

function sha256(value, field) {
  assertion(typeof value === "string" && /^[0-9a-f]{64}$/.test(value), `${field} must be a 64-character lowercase SHA-256`);
}

function baseline(value) {
  assertion(value === P18_PRODUCT_BASELINE, `baseline_commit must equal frozen P18 product baseline ${P18_PRODUCT_BASELINE}`);
}

function rejectAutomationText(values, field) {
  const joined = values.filter((value) => typeof value === "string").join(" ");
  assertion(!AUTOMATION_MARKERS.test(joined), `${field} contains automation/emulation markers and cannot qualify as human evidence`);
}

export function validateDefects(defects, field = "defects") {
  assertion(Array.isArray(defects), `${field} must be an array`);
  for (const [index,defect] of defects.entries()) {
    assertion(isObject(defect), `${field}[${index}] must be an object`);
    assertion(/^#\d+$/.test(String(defect.issue ?? "")), `${field}[${index}].issue must be a GitHub issue reference such as #123`);
    assertion(DEFECT_SEVERITIES.has(defect.severity), `${field}[${index}].severity is invalid`);
    assertion(DEFECT_CATEGORIES.has(defect.category), `${field}[${index}].category is invalid`);
    assertion(DEFECT_STATUSES.has(defect.status), `${field}[${index}].status is invalid`);
  }
  return defects;
}

function blockingDefects(records, idField) {
  return records.flatMap((record) => (record.defects ?? []).filter((defect) => {
    if (defect.category === "data-loss" || defect.category === "compatibility") return defect.status !== "resolved";
    return defect.status === "open" && (defect.severity === "critical" || defect.severity === "high");
  }).map((defect) => ({[idField]:record[idField],...defect})));
}

export function validateRealWorldCase(record) {
  assertion(isObject(record), "Real-world case must be an object");
  scanPrivacy(record);
  assertion(record.schema === 1, "real-world case schema must equal 1");
  baseline(record.baseline_commit);
  nonempty(record.case_id, "case_id");
  assertion(record.evidence_source === "human-real-world-document", "evidence_source must equal human-real-world-document");
  assertion(record.human_attestation === true, "human_attestation must be true");
  assertion(record.privacy_attestation === true, "privacy_attestation must be true");
  assertion(record.content_committed === false, "content_committed must be false");
  assertion(ORIGINS.has(record.origin_class), "origin_class is invalid");
  sha256(record.source_sha256, "source_sha256");
  assertion(Number.isInteger(record.byte_size) && record.byte_size > 0, "byte_size must be a positive integer");
  assertion(Number.isInteger(record.page_count) && record.page_count >= 0, "page_count must be a non-negative integer");
  assertion(Array.isArray(record.categories) && record.categories.length > 0, "categories must be a non-empty array");
  assertion(new Set(record.categories).size === record.categories.length, "categories contains duplicates");
  for (const category of record.categories) assertion(REAL_WORLD_CATEGORIES.includes(category), `Unknown real-world category ${category}`);
  assertion(REAL_WORLD_RESULTS.has(record.product_result), "product_result is invalid");
  validateDefects(record.defects);
  rejectAutomationText([record.case_id,record.origin_class], "real-world case");
  return record;
}

function validateArtifact(artifact) {
  assertion(isObject(artifact), "artifact must be an object");
  assertion(OUTPUT_WORKFLOW_IDS.includes(artifact.workflow_id), "artifact.workflow_id must be W01-W05");
  const expectedKind = artifact.workflow_id === "W01" ? "docx" : "pdf";
  assertion(artifact.kind === expectedKind, `artifact.kind for ${artifact.workflow_id} must be ${expectedKind}`);
  sha256(artifact.sha256, "artifact.sha256");
  assertion(Number.isInteger(artifact.byte_size) && artifact.byte_size > 0, "artifact.byte_size must be a positive integer");
  if (artifact.kind === "pdf") assertion(Number.isInteger(artifact.page_count) && artifact.page_count > 0, "PDF artifact.page_count must be positive");
}

function validateExternalChecks(run) {
  assertion(Array.isArray(run.checks), "checks must be an array");
  const expected = run.artifact.kind === "docx"
    ? ["open","editable-structure","content","workflow-specific"]
    : ["open","render","content","workflow-specific"];
  const ids = run.checks.map((entry) => entry?.id);
  assertion(ids.length === expected.length && new Set(ids).size === ids.length, "checks must contain the exact required check set");
  for (const id of expected) assertion(ids.includes(id), `checks is missing ${id}`);
  for (const entry of run.checks) assertion(CHECK_RESULTS.has(entry.result), `checks.${entry.id}.result is invalid`);
}

export function validateExternalReaderRun(run) {
  assertion(isObject(run), "External-reader run must be an object");
  scanPrivacy(run);
  assertion(run.schema === 1, "external-reader schema must equal 1");
  baseline(run.baseline_commit);
  nonempty(run.run_id, "run_id");
  assertion(run.evidence_source === "human-external-application", "evidence_source must equal human-external-application");
  assertion(run.human_attestation === true, "human_attestation must be true");
  assertion(run.automation_used_for_observation === false, "automation_used_for_observation must be false");
  nonempty(run.source_case_id, "source_case_id");
  validateArtifact(run.artifact);
  assertion(isObject(run.application), "application must be an object");
  const family = run.application.family;
  if (run.artifact.kind === "docx") assertion(OFFICE_READERS.has(family), "DOCX must be qualified in an external office reader");
  else assertion(PDF_READERS.has(family), "PDF reader family is invalid");
  nonempty(run.application.name, "application.name");
  version(run.application.version, "application.version");
  assertion(OS_FAMILIES.has(run.application.os_family), "application.os_family is invalid");
  version(run.application.os_version, "application.os_version");
  validateExternalChecks(run);
  validateDefects(run.defects);
  rejectAutomationText([run.run_id,run.application.name,run.application.version,run.application.os_version], "external-reader run");
  return run;
}

function validateEnvironment(environment) {
  assertion(isObject(environment), "environment must be an object");
  assertion(/^\d{4}-\d{2}-\d{2}$/.test(String(environment.date ?? "")), "environment.date must use YYYY-MM-DD");
  assertion(DEVICE_CLASSES.has(environment.device_class), "environment.device_class is invalid");
  nonempty(environment.device_model, "environment.device_model");
  assertion(OS_FAMILIES.has(environment.os_family), "environment.os_family is invalid");
  version(environment.os_version, "environment.os_version");
  assertion(BROWSER_FAMILIES.has(environment.browser_family), "environment.browser_family is invalid");
  nonempty(environment.browser_name, "environment.browser_name");
  version(environment.browser_version, "environment.browser_version");
  assertion(INPUT_MODES.has(environment.input_mode), "environment.input_mode is invalid");
  assertion(/^\d+x\d+$/.test(String(environment.viewport ?? "")), "environment.viewport must use WIDTHxHEIGHT");
  assertion(APP_MODES.has(environment.app_mode), "environment.app_mode is invalid");
  assertion(environment.build_channel === P18_BUILD_CHANNEL, `environment.build_channel must equal ${P18_BUILD_CHANNEL}`);
  sha256(environment.release_integrity_sha256, "environment.release_integrity_sha256");
  rejectAutomationText([environment.device_model,environment.os_version,environment.browser_name,environment.browser_version], "device environment");
}

function validateWorkflowResults(results) {
  assertion(Array.isArray(results) && results.length === WORKFLOW_IDS.length, "workflow_results must contain exactly W01-W06");
  const ids = results.map((entry) => entry?.id);
  assertion(new Set(ids).size === ids.length, "workflow_results contains duplicate IDs");
  for (const id of WORKFLOW_IDS) assertion(ids.includes(id), `workflow_results is missing ${id}`);
  for (const entry of results) {
    assertion(HUMAN_RESULTS.has(entry.result), `workflow_results.${entry.id}.result is invalid`);
    if (entry.id === "W06") {
      assertion(entry.source_case_id == null, "W06 source_case_id must be null");
      assertion(entry.artifact_sha256 == null, "W06 artifact_sha256 must be null");
      continue;
    }
    if (entry.result !== "NOT_RUN") nonempty(entry.source_case_id, `workflow_results.${entry.id}.source_case_id`);
    if (entry.result === "PASS" || entry.result === "PASS WITH EXPECTED LIMITATION" || entry.result === "FAIL") {
      sha256(entry.artifact_sha256, `workflow_results.${entry.id}.artifact_sha256`);
    } else assertion(entry.artifact_sha256 == null, `workflow_results.${entry.id}.artifact_sha256 must be null when no output was produced`);
  }
}

export function validateDeviceRun(run) {
  assertion(isObject(run), "Device run must be an object");
  scanPrivacy(run);
  assertion(run.schema === 1, "device-run schema must equal 1");
  baseline(run.baseline_commit);
  nonempty(run.run_id, "run_id");
  assertion(/^anon-[a-z0-9_-]+$/.test(String(run.tester_id ?? "")), "tester_id must be an anonymous ID beginning anon-");
  assertion(run.evidence_source === "human-physical-device", "evidence_source must equal human-physical-device");
  assertion(run.human_attestation === true, "human_attestation must be true");
  assertion(run.physical_device === true, "physical_device must be true");
  assertion(run.simulator_or_emulator === false, "simulator_or_emulator must be false");
  assertion(run.automation_used_for_observation === false, "automation_used_for_observation must be false");
  validateEnvironment(run.environment);
  validateWorkflowResults(run.workflow_results);
  validateDefects(run.defects);
  rejectAutomationText([run.run_id,run.tester_id], "device run");
  return run;
}

function idsUnique(records, field, label) {
  const ids = records.map((record) => record[field]);
  assertion(new Set(ids).size === ids.length, `${label} contains duplicate ${field} values`);
}

function qualifyingExternal(run) {
  return run.checks.every((entry) => QUALIFYING.has(entry.result));
}

function realWorldSummary(cases) {
  if (!cases.length) return {status:"REAL_WORLD_UNMEASURED",cases:0,coveredCategories:[],missingCategories:[...REAL_WORLD_CATEGORIES],failingCases:[],blockingDefects:[]};
  const qualifyingCases = cases.filter((record) => QUALIFYING.has(record.product_result));
  const covered = [...new Set(qualifyingCases.flatMap((record) => record.categories))].sort();
  const missing = REAL_WORLD_CATEGORIES.filter((category) => !covered.includes(category));
  const failingCases = cases.filter((record) => record.product_result === "FAIL").map((record) => record.case_id);
  const blocks = blockingDefects(cases,"case_id");
  let status;
  if (failingCases.length || blocks.length) status = "REAL_WORLD_BLOCKED";
  else if (missing.length) status = "REAL_WORLD_INCOMPLETE";
  else status = "REAL_WORLD_TARGET_MET";
  return {status,cases:cases.length,qualifyingCases:qualifyingCases.length,coveredCategories:covered,missingCategories:missing,failingCases,blockingDefects:blocks};
}

function externalSummary(runs, caseIds) {
  if (!runs.length) return {
    status:"EXTERNAL_READER_UNMEASURED",runs:0,coveredWorkflows:[],missingWorkflows:[...OUTPUT_WORKFLOW_IDS],
    distinctPdfReaderFamilies:0,nativePdfReaderCovered:false,officeReaderCovered:false,blockingDefects:[]
  };
  const unknownCases = [...new Set(runs.map((run) => run.source_case_id).filter((id) => !caseIds.has(id)))];
  assertion(!unknownCases.length, `External-reader evidence references unknown real-world cases: ${unknownCases.join(", ")}`);
  const coveredWorkflows = [...new Set(runs.filter(qualifyingExternal).map((run) => run.artifact.workflow_id))].sort();
  const missingWorkflows = OUTPUT_WORKFLOW_IDS.filter((id) => !coveredWorkflows.includes(id));
  const pdfFamilies = new Set(runs.filter((run) => run.artifact.kind === "pdf" && qualifyingExternal(run)).map((run) => run.application.family));
  const nativePdfReaderCovered = [...pdfFamilies].some((family) => NATIVE_PDF_READERS.has(family));
  const officeReaderCovered = runs.some((run) => run.artifact.kind === "docx" && qualifyingExternal(run) && OFFICE_READERS.has(run.application.family));
  const failures = runs.filter((run) => run.checks.some((entry) => entry.result === "FAIL")).map((run) => run.run_id);
  const blocks = blockingDefects(runs,"run_id");
  let status;
  if (failures.length || blocks.length) status = "EXTERNAL_READER_BLOCKED";
  else if (missingWorkflows.length || pdfFamilies.size < 2 || !nativePdfReaderCovered || !officeReaderCovered) status = "EXTERNAL_READER_INCOMPLETE";
  else status = "EXTERNAL_READER_TARGET_MET";
  return {
    status,runs:runs.length,coveredWorkflows,missingWorkflows,distinctPdfReaderFamilies:pdfFamilies.size,
    pdfReaderFamilies:[...pdfFamilies].sort(),nativePdfReaderCovered,officeReaderCovered,failingRuns:failures,blockingDefects:blocks
  };
}

function deviceSummary(runs, caseIds) {
  if (!runs.length) return {
    status:"PHYSICAL_DEVICE_UNMEASURED",runs:0,phoneCovered:false,tabletCovered:false,installedPwaCovered:false,
    coveredWorkflows:[],missingWorkflows:[...WORKFLOW_IDS],blockingDefects:[]
  };
  const unknown = [];
  for (const run of runs) for (const result of run.workflow_results) {
    if (result.id !== "W06" && result.source_case_id && !caseIds.has(result.source_case_id)) unknown.push(result.source_case_id);
  }
  assertion(!unknown.length, `Physical-device evidence references unknown real-world cases: ${[...new Set(unknown)].join(", ")}`);
  const phoneCovered = runs.some((run) => run.environment.device_class === "phone");
  const tabletCovered = runs.some((run) => run.environment.device_class === "tablet");
  const installedPwaCovered = runs.some((run) => run.environment.app_mode === "installed-pwa");
  const coveredWorkflows = WORKFLOW_IDS.filter((id) => runs.some((run) => run.workflow_results.some((entry) => entry.id === id && QUALIFYING.has(entry.result))));
  const missingWorkflows = WORKFLOW_IDS.filter((id) => !coveredWorkflows.includes(id));
  const failing = runs.flatMap((run) => run.workflow_results.filter((entry) => entry.result === "FAIL").map((entry) => ({run_id:run.run_id,workflow_id:entry.id})));
  const blocks = blockingDefects(runs,"run_id");
  let status;
  if (failing.length || blocks.length) status = "PHYSICAL_DEVICE_BLOCKED";
  else if (!phoneCovered || !tabletCovered || !installedPwaCovered || missingWorkflows.length) status = "PHYSICAL_DEVICE_INCOMPLETE";
  else status = "PHYSICAL_DEVICE_TARGET_MET";
  return {status,runs:runs.length,phoneCovered,tabletCovered,installedPwaCovered,coveredWorkflows,missingWorkflows,failingResults:failing,blockingDefects:blocks};
}

export function summarizeQualification(raw = {}) {
  const cases=(raw.cases ?? []).map(validateRealWorldCase);
  const externalRuns=(raw.externalRuns ?? []).map(validateExternalReaderRun);
  const deviceRuns=(raw.deviceRuns ?? []).map(validateDeviceRun);
  idsUnique(cases,"case_id","Real-world evidence");
  idsUnique(externalRuns,"run_id","External-reader evidence");
  idsUnique(deviceRuns,"run_id","Physical-device evidence");
  const caseIds=new Set(cases.map((record) => record.case_id));
  const realWorld=realWorldSummary(cases);
  const external=externalSummary(externalRuns,caseIds);
  const physical=deviceSummary(deviceRuns,caseIds);
  const qualified = realWorld.status === "REAL_WORLD_TARGET_MET"
    && external.status === "EXTERNAL_READER_TARGET_MET"
    && physical.status === "PHYSICAL_DEVICE_TARGET_MET";
  return {
    schemaVersion:1,
    phase:"P18",
    productBaselineCommit:P18_PRODUCT_BASELINE,
    realWorld,
    externalReaders:external,
    physicalDevices:physical,
    certificationStatus:qualified ? "P18_V72_QUALIFIED" : "NOT_QUALIFIED"
  };
}

function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort().map((name) => path.join(directory,name));
}

export function loadEvidence(repoRoot) {
  const root=repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
  const readMany=(directory) => jsonFiles(directory).map((file) => JSON.parse(fs.readFileSync(file,"utf8")));
  return {
    cases:readMany(path.join(root,"docs/p18/evidence/real-world")),
    externalRuns:readMany(path.join(root,"docs/p18/evidence/external-readers")),
    deviceRuns:readMany(path.join(root,"docs/p18/evidence/device-runs"))
  };
}

export function validateStatusContract(status, summary) {
  assertion(status?.schemaVersion === 1 && status?.phase === "P18", "P18 status schema/phase invalid");
  assertion(status.product_baseline_commit === P18_PRODUCT_BASELINE, "P18 status baseline mismatch");
  assertion(status.framework_status === "READY_FOR_FIELDWORK", "P18 framework_status must remain READY_FOR_FIELDWORK until P19 promotion");
  assertion(status.real_world_status === summary.realWorld.status, `real_world_status must equal derived ${summary.realWorld.status}`);
  assertion(status.external_reader_status === summary.externalReaders.status, `external_reader_status must equal derived ${summary.externalReaders.status}`);
  assertion(status.physical_device_status === summary.physicalDevices.status, `physical_device_status must equal derived ${summary.physicalDevices.status}`);
  assertion(status.certification_status === summary.certificationStatus, `certification_status must equal derived ${summary.certificationStatus}`);
  return status;
}

function runCli() {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
  try {
    const summary=summarizeQualification(loadEvidence(root));
    if (process.argv.includes("--status-contract")) {
      const status=JSON.parse(fs.readFileSync(path.join(root,"docs/p18/status.json"),"utf8"));
      validateStatusContract(status,summary);
    }
    console.log(JSON.stringify(summary,null,2));
  } catch(error) {
    console.error(JSON.stringify({status:"P18_EVIDENCE_INVALID",error:error instanceof Error ? error.message : String(error)},null,2));
    process.exitCode=1;
  }
}

const invoked=process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) runCli();

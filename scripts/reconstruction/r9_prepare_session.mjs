#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { R9_BUILD_CHANNEL } from "./r9_validate_evidence.mjs";

const DISCOVERY_IDS = Array.from({ length: 20 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`);

function parseArgs(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options.set(key, value);
    index += 1;
  }
  return options;
}

function seededBytes(seed, counter) {
  return crypto.createHash("sha256").update(`${seed}:${counter}`).digest();
}

export function deterministicOrder(sessionId) {
  const result = [...DISCOVERY_IDS];
  let counter = 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const bytes = seededBytes(sessionId, counter);
    counter += 1;
    const value = bytes.readUInt32BE(0);
    const swapIndex = value % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  if (result.join(",") === DISCOVERY_IDS.join(",")) {
    [result[0], result[1]] = [result[1], result[0]];
  }
  return result;
}

function requireOption(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`Required option --${name} is missing`);
  return value;
}

export function physicalEnvironmentFromOptions(options) {
  const attestation = requireOption(options, "attest-physical-device");
  if (attestation !== "yes") throw new Error("--attest-physical-device must equal yes after a human verifies this is a physical-device session");
  return {
    date: options.get("date") || new Date().toISOString().slice(0, 10),
    evidence_source: "human-physical-device",
    physical_device: true,
    simulator_or_emulator: false,
    automation_used_for_observation: false,
    human_attestation: true,
    device_class: requireOption(options, "device-class"),
    device_model: requireOption(options, "device-model"),
    os_family: requireOption(options, "os-family"),
    os_version: requireOption(options, "os-version"),
    browser_family: requireOption(options, "browser-family"),
    browser_name: requireOption(options, "browser-name"),
    browser_version: requireOption(options, "browser-version"),
    input_mode: requireOption(options, "input-mode"),
    viewport: requireOption(options, "viewport"),
    app_mode: requireOption(options, "app-mode"),
    build_channel: R9_BUILD_CHANNEL
  };
}

export function buildSession(template, options) {
  const sessionId = requireOption(options, "session-id");
  const testerId = requireOption(options, "tester-id");
  const familiarity = requireOption(options, "familiarity");
  const pdfExperience = requireOption(options, "pdf-experience");
  const corpusId = options.get("corpus-id") || "r9-manual-v2";

  const session = structuredClone(template);
  session.session_id = sessionId;
  session.tester_id = testerId;
  session.tester_profile = {
    familiarity,
    pdf_experience: pdfExperience
  };
  session.environment = physicalEnvironmentFromOptions(options);
  session.corpus_id = corpusId;
  session.measurement_order = deterministicOrder(sessionId);
  return session;
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(scriptDir, "../..");
    const templatePath = path.join(repoRoot, "docs/reconstruction/r9-session-template.json");
    const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
    const session = buildSession(template, options);
    const defaultOutput = path.join(repoRoot, "docs/reconstruction/evidence/r9/sessions", `${session.session_id}.json`);
    const output = path.resolve(options.get("out") || defaultOutput);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (fs.existsSync(output)) throw new Error(`Refusing to overwrite existing session file: ${output}`);
    fs.writeFileSync(output, `${JSON.stringify(session, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      created: output,
      session_id: session.session_id,
      tester_id: session.tester_id,
      physical_device_attested: true,
      measurement_order: session.measurement_order
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

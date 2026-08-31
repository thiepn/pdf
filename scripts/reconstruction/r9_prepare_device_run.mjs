#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { physicalEnvironmentFromOptions } from "./r9_prepare_session.mjs";

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

function requireOption(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`Required option --${name} is missing`);
  return value;
}

export function buildDeviceRun(template, options) {
  const run = structuredClone(template);
  run.run_id = requireOption(options, "run-id");
  run.tester_id = requireOption(options, "tester-id");
  run.environment = physicalEnvironmentFromOptions(options);
  run.corpus_id = options.get("corpus-id") || "p43-real-device-v1";
  return run;
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(scriptDir, "../..");
    const templatePath = path.join(repoRoot, "docs/reconstruction/p43-real-device-run-template.json");
    const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
    const run = buildDeviceRun(template, options);
    const defaultOutput = path.join(repoRoot, "docs/reconstruction/evidence/r9/device-runs", `${run.run_id}.json`);
    const output = path.resolve(options.get("out") || defaultOutput);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (fs.existsSync(output)) throw new Error(`Refusing to overwrite existing device-run file: ${output}`);
    fs.writeFileSync(output, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      created: output,
      run_id: run.run_id,
      tester_id: run.tester_id,
      physical_device_attested: true,
      journey_results: run.journey_results.length
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();

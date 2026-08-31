#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const recorderPath = path.join(repoRoot, "docs/reconstruction/r9-session-recorder.html");
const source = fs.readFileSync(recorderPath, "utf8");

function requireMatch(condition, message) {
  if (!condition) throw new Error(message);
}

const forbidden = [
  [/https?:\/\//i, "external URL literal"],
  [/\bfetch\s*\(/, "fetch API"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bEventSource\b/, "EventSource"],
  [/\bsendBeacon\b/, "sendBeacon"],
  [/<script[^>]+src\s*=/i, "external script source"],
  [/<link[^>]+href\s*=/i, "external stylesheet/resource link"],
  [/<form[^>]+action\s*=/i, "form action"]
];

for (const [pattern, name] of forbidden) {
  requireMatch(!pattern.test(source), `R9 recorder contract failed: ${name} is forbidden`);
}

for (let index = 1; index <= 20; index += 1) {
  const id = `D${String(index).padStart(2, "0")}`;
  requireMatch(source.includes(`"${id}"`), `R9 recorder contract failed: missing ${id}`);
}
for (let index = 1; index <= 10; index += 1) {
  const id = `C${String(index).padStart(2, "0")}`;
  requireMatch(source.includes(`"${id}"`), `R9 recorder contract failed: missing ${id}`);
}

requireMatch(source.includes("x.schema!==3"), "R9 recorder contract failed: schema 3 is not enforced");
requireMatch(source.includes("human-physical-device"), "R9 recorder contract failed: physical-device evidence source is not enforced");
requireMatch(source.includes("physical_device!==true"), "R9 recorder contract failed: physical-device attestation is not enforced");
requireMatch(source.includes("simulator_or_emulator!==false"), "R9 recorder contract failed: simulator exclusion is not enforced");
requireMatch(source.includes("automation_used_for_observation!==false"), "R9 recorder contract failed: automation exclusion is not enforced");
requireMatch(source.includes("human_attestation!==true"), "R9 recorder contract failed: human attestation is not enforced");
requireMatch(source.includes("measurement_order"), "R9 recorder contract failed: randomized measurement order is not consumed");
requireMatch(source.includes("type=\"file\""), "R9 recorder contract failed: local session file input is missing");
requireMatch(source.includes("new Blob("), "R9 recorder contract failed: local evidence export is missing");
requireMatch(/function\s+exportJson\s*\(\)\s*\{\s*saveCurrent\(\)/.test(source), "R9 recorder contract failed: export must save the current observation first");
requireMatch(source.includes("Recorder-only canonical destination"), "R9 recorder contract failed: recorder-only scoring context is missing");

console.log(JSON.stringify({
  status: "R9_RECORDER_CONTRACT_PASS",
  recorder: path.relative(repoRoot, recorderPath),
  session_schema: 3,
  physical_device_attestation: "REQUIRED",
  simulator_or_emulator: "FORBIDDEN",
  automation_observation: "FORBIDDEN",
  discovery_items: 20,
  completion_items: 10,
  network_capability: "ABSENT",
  export_autosaves_current_item: true
}, null, 2));

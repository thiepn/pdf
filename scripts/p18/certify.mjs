#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEvidence, summarizeQualification } from "./qualification-evidence.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
try {
  const summary=summarizeQualification(loadEvidence(root));
  console.log(JSON.stringify(summary,null,2));
  if (summary.certificationStatus !== "P18_V72_QUALIFIED") {
    console.error("P18 certification refused: real-world, external-reader and physical-device evidence must all reach target with no blocking failures.");
    process.exitCode=1;
  }
} catch(error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode=1;
}

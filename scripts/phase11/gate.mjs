import { spawnSync } from "node:child_process";

const commands = [
  [process.execPath, ["scripts/phase11/dependency-policy.mjs"]],
  [process.execPath, ["scripts/source-audit.mjs"]],
  [process.execPath, ["scripts/phase11/offline-typecheck.mjs"]],
  [process.execPath, ["scripts/phase11/runtime-regression.mjs"]],
  ["python", ["scripts/phase11/generate_corpus.py"]],
  ["python", ["scripts/phase11/validate_corpus.py"]]
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    console.error(`Required executable unavailable: ${command}`);
    process.exit(2);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Phase 11 offline stability gate passed. Full npm, browser, and deployed validation remain mandatory for stable release.");

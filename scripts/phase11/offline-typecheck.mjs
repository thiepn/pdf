import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const executable = process.platform === "win32" ? "tsc.cmd" : "tsc";
const result = spawnSync(executable, ["-p", "tsconfig.phase11.json", "--pretty", "false"], { stdio: "inherit" });
if (result.error?.code === "ENOENT") {
  console.error("TypeScript is unavailable. Install dependencies and run npm run typecheck instead.");
  process.exit(2);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Offline internal semantic check passed. Official dependency declarations are still required by the stable gate.");

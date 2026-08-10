import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";

try { statSync("dist/index.html"); }
catch { console.error("Verified browser run requires an existing dist. Run the Phase 27 core release gate first."); process.exit(1); }

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(command, ["run", "test:e2e"], {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_SKIP_BUILD: "1" }
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

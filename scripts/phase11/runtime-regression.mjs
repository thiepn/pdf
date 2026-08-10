import { rm, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await rm(".phase11-runtime", { recursive: true, force: true });
await mkdir(".phase11-runtime", { recursive: true });
const tsc = spawnSync(process.platform === "win32" ? "tsc.cmd" : "tsc", ["-p", "tsconfig.phase11-runtime.json", "--pretty", "false"], { stdio: "inherit" });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);
await writeFile(".phase11-runtime/package.json", JSON.stringify({ type: "commonjs" }));
const runtime = spawnSync(process.execPath, ["scripts/phase11/runtime-regression.cjs"], { stdio: "inherit" });
process.exit(runtime.status ?? 1);

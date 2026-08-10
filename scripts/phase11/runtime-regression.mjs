import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const tsc = spawnSync(
  isWindows ? process.env.ComSpec ?? "cmd.exe" : "tsc",
  isWindows
    ? ["/d", "/s", "/c", "tsc.cmd -p tsconfig.phase11-runtime.json --pretty false"]
    : ["-p", "tsconfig.phase11-runtime.json", "--pretty", "false"],
  { stdio: "inherit" }
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);
const runtime = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "scripts/phase11/runtime-regression.cjs"],
  { stdio: "inherit" }
);
process.exit(runtime.status ?? 1);

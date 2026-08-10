import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const expectedNpm = String(packageJson.packageManager ?? "").replace(/^npm@/, "");
const node = process.versions.node;
const npm = process.platform === "win32"
  ? execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm.cmd --version"], { encoding: "utf8" }).trim()
  : execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
const failures = [];
const [major, minor] = node.split(".").map(Number);
if (major !== 22 || minor < 12) failures.push(`Node ${node} is outside the qualified Node 22.12+ line.`);
if (!expectedNpm) failures.push("packageManager must pin an npm version.");
else if (npm !== expectedNpm) failures.push(`npm ${npm} does not match packageManager npm@${expectedNpm}.`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Phase 27 toolchain audit passed: Node ${node}, npm ${npm}.`);

import { readFile, writeFile } from "node:fs/promises";

const maintenance = [
  "scripts/releases/v6.0.1/runtime-regression.mjs",
  "scripts/releases/v6.0.2/runtime-regression.mjs",
  "scripts/releases/v6.0.3/runtime-regression.mjs",
  "scripts/releases/v6.0.4/runtime-regression.mjs",
  "scripts/releases/v6.0.5/runtime-regression.mjs",
  "scripts/releases/v6.0.6/runtime-regression.mjs",
  "scripts/releases/v6.1.0/runtime-regression.mjs"
];

for (const path of maintenance) {
  let text = await readFile(path, "utf8");
  const lines = text.split("\n");
  const index = lines.findIndex((line) => line.includes("check(") && line.includes("packageJson.version") && line.includes("APP_VERSION"));
  if (index >= 0) {
    lines[index] = 'check(/^[67]\\.\\d+\\.\\d+$/.test(packageJson.version) && release.includes(`APP_VERSION = "${packageJson.version}"`), "historical v6 regression remains release-version synchronized on v6/v7");';
    text = lines.join("\n");
    await writeFile(path, text);
    console.log(`P9 widened historical release-version guard: ${path}`);
  }
}

const browserPath = "tests/e2e/phase27.spec.ts";
let browser = await readFile(browserPath, "utf8");
if (!browser.includes("PDF Studio 6.1.0")) throw new Error("P9 expected the Phase 27 release-page version assertion.");
browser = browser.replace("PDF Studio 6.1.0", "PDF Studio 7.0.0");
await writeFile(browserPath, browser);
console.log(`P9 updated ${browserPath}`);

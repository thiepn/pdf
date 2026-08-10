import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const failures = [];
for (const section of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) failures.push(`${name} is not exact: ${version}`);
  }
}
if (packageJson.devDependencies?.["@playwright/test"] !== "1.62.0") failures.push("@playwright/test must use published stable version 1.62.0.");
if (packageJson.engines?.node !== ">=22.12.0") failures.push("Node engine must match the Vite 8 Node 22 floor: >=22.12.0.");
if (packageJson.engines?.npm !== ">=10.9.2 <11") failures.push("npm engine must remain on the qualified npm 10.9 line: >=10.9.2 <11.");
if (packageJson.packageManager !== "npm@10.9.2") failures.push("packageManager must pin npm@10.9.2 for Phase 27 qualification.");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Dependency policy passed: exact package versions, published Playwright release, supported Node floor, and pinned npm 10.9.2 toolchain.");

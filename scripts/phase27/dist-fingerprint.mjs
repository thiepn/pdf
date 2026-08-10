import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] || "dist");
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}
const lines = [];
for (const file of (await walk(root)).sort()) {
  const name = relative(root, file).replaceAll("\\", "/");
  const bytes = await readFile(file);
  lines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
const digest = createHash("sha256").update(lines.join("\n")).digest("hex");
console.log(digest);

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const ROOT_NOTICE = /^(?:licen[cs]e|notice|copying)(?:[._-].*)?$/i;
// These are browser-side transitive helpers. Node-only/optional native packages
// are not copied into the browser artifact by this inventory.
const helpers = ["scheduler", "bmp-js", "idb-keyval", "is-url", "regenerator-runtime", "wasm-feature-detect", "zlibjs"];
const bundledNotices = { "tesseract.js": ["dist/tesseract.min.js.LICENSE.txt", "dist/worker.min.js.LICENSE.txt"] };

export async function expectedLicenseBundle(root) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  const names = [...new Set([...Object.keys(pkg.dependencies ?? {}), ...helpers.filter(name => lock.packages?.[`node_modules/${name}`])])].sort();
  assert.ok(names.length, "No production dependencies to document");
  const applicationLicense = await readFile(join(root, "LICENSE"));
  const repositoryNotice = await readFile(join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
  const packages = [];
  const sections = [`PDF Studio ${pkg.version} - third-party licences and notices`, repositoryNotice.trim()];
  for (const name of names) {
    assert.match(name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i, "Invalid package name");
    const directory = join(root, "node_modules", name);
    const installed = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    const pinned = lock.packages?.[`node_modules/${name}`];
    assert.equal(installed.name, name, `Package identity mismatch: ${name}`);
    assert.equal(installed.version, pinned?.version, `Package version mismatch: ${name}`);
    if (pkg.dependencies?.[name]) assert.equal(installed.version, pkg.dependencies[name], `Unpinned production dependency: ${name}`);
    const files = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && ROOT_NOTICE.test(entry.name)).map(entry => entry.name);
    assert.ok(files.some(file => /^licen[cs]e/i.test(file)), `Missing upstream licence: ${name}`);
    files.push(...(bundledNotices[name] ?? []));
    const notices = [];
    sections.push(`\n${"=".repeat(72)}\n${name} ${installed.version}\nDeclared upstream licence: ${typeof installed.license === "string" ? installed.license : "See upstream text"}`);
    for (const file of [...new Set(files)].sort()) {
      const bytes = await readFile(join(directory, file));
      assert.ok(bytes.length > 0, `Empty upstream notice: ${name}/${file}`);
      notices.push({ file, bytes: bytes.length, sha256: digest(bytes) });
      sections.push(`--- ${name}/${file} ---\n${bytes.toString("utf8")}`);
    }
    packages.push({ name, version: installed.version, license: installed.license ?? null, notices });
  }
  const combined = Buffer.from(sections.join("\n\n") + "\n");
  const inventory = {
    schemaVersion: 1,
    application: { name: pkg.name, version: pkg.version },
    packageLockSha256: digest(await readFile(join(root, "package-lock.json"))),
    files: [
      { path: "LICENSE.txt", bytes: applicationLicense.length, sha256: digest(applicationLicense) },
      { path: "THIRD_PARTY_NOTICES.txt", bytes: combined.length, sha256: digest(combined) }
    ],
    packages
  };
  return new Map([
    ["LICENSE.txt", applicationLicense],
    ["THIRD_PARTY_NOTICES.txt", combined],
    ["license-inventory.json", Buffer.from(JSON.stringify(inventory, null, 2) + "\n")]
  ]);
}

export async function writeLicenseBundle(root, output) {
  const files = await expectedLicenseBundle(resolve(root));
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of files) await writeFile(join(output, name), bytes);
}

/** Release audits compare the actual output, not merely the presence of a file. */
export async function verifyLicenseBundle(root, output) {
  const expected = await expectedLicenseBundle(resolve(root));
  for (const [name, bytes] of expected) {
    const actual = await readFile(join(output, name));
    assert.ok(actual.equals(bytes), `Missing, stale or modified release licence file: ${name}`);
  }
}

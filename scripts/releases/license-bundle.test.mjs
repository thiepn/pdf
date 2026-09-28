import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectedLicenseBundle, verifyLicenseBundle, writeLicenseBundle } from "./license-bundle.mjs";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "pdf-licenses-"));
  const module = join(root, "node_modules", "example-runtime");
  await mkdir(module, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "pdf-studio", version: "7.1.0", dependencies: { "example-runtime": "1.2.3" } }));
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ packages: { "node_modules/example-runtime": { version: "1.2.3" } } }));
  await writeFile(join(root, "LICENSE"), "Application licence\n");
  await writeFile(join(root, "THIRD_PARTY_NOTICES.md"), "# Third-party notices\n");
  await writeFile(join(module, "package.json"), JSON.stringify({ name: "example-runtime", version: "1.2.3", license: "MIT" }));
  await writeFile(join(module, "LICENSE"), "Copyright example\nPermission notice\n");
  try { await run(root, module, join(root, "dist")); }
  finally { await rm(root, { recursive: true, force: true }); }
}

describe("release licence packaging", () => {
  it("emits deterministic notices, exact versions, upstream texts and digests", () => fixture(async (root, module, output) => {
    await writeFile(join(module, "NOTICE.txt"), "Additional attribution\n");
    await writeLicenseBundle(root, output);
    const first = await readFile(join(output, "THIRD_PARTY_NOTICES.txt"));
    assert.match(first.toString(), /example-runtime 1\.2\.3/);
    assert.match(first.toString(), /Copyright example\nPermission notice/);
    assert.match(first.toString(), /Additional attribution/);
    const inventory = JSON.parse(await readFile(join(output, "license-inventory.json"), "utf8"));
    assert.equal(inventory.packages[0].notices.length, 2);
    assert.match(inventory.packageLockSha256, /^[a-f0-9]{64}$/);
    await writeLicenseBundle(root, output);
    assert.deepEqual(await readFile(join(output, "THIRD_PARTY_NOTICES.txt")), first);
    await verifyLicenseBundle(root, output);
  }));
  it("fails closed when an upstream licence is absent or empty", () => fixture(async (root, module) => {
    await rm(join(module, "LICENSE"));
    await assert.rejects(() => expectedLicenseBundle(root), /Missing upstream licence/);
    await writeFile(join(module, "LICENSE"), "");
    await assert.rejects(() => expectedLicenseBundle(root), /Empty upstream notice/);
  }));
  it("rejects an installed version different from the lock", () => fixture(async (root, module) => {
    await writeFile(join(module, "package.json"), JSON.stringify({ name: "example-runtime", version: "9.0.0" }));
    await assert.rejects(() => expectedLicenseBundle(root), /Package version mismatch/);
  }));
  it("rejects deleted and modified distribution notices", () => fixture(async (root, _module, output) => {
    await writeLicenseBundle(root, output);
    await writeFile(join(output, "THIRD_PARTY_NOTICES.txt"), "Truncated");
    await assert.rejects(() => verifyLicenseBundle(root, output), /modified release licence/);
    await writeLicenseBundle(root, output);
    await rm(join(output, "LICENSE.txt"));
    await assert.rejects(() => verifyLicenseBundle(root, output));
  }));
  it("rejects stale inventory metadata after the lock changes", () => fixture(async (root, _module, output) => {
    await writeLicenseBundle(root, output);
    await writeFile(join(root, "package-lock.json"), (await readFile(join(root, "package-lock.json"), "utf8")) + "\n");
    await assert.rejects(() => verifyLicenseBundle(root, output), /license-inventory/);
  }));
  it("rejects traversal in a dependency name", () => fixture(async root => {
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "../outside": "1.0.0" } }));
    await assert.rejects(() => expectedLicenseBundle(root), /Invalid package name/);
  }));
});

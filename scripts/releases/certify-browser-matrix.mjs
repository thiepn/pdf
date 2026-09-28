import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

export const channels = ["release-candidate", "stable"];
export const projects = ["chromium", "firefox", "webkit", "mobile-chromium", "tablet-webkit"];

export function summarizeReport(report, project) {
  assert.ok(report && typeof report === "object", "Missing browser report");
  assert.ok(Array.isArray(report.suites) && report.suites.length, "Empty browser suites");
  assert.equal((report.errors ?? []).length, 0, "Global browser-run errors");
  let passed = 0, skipped = 0;
  const skipReasons = {};
  function visit(suite) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      assert.equal(test.projectName, project, "Report contains a different browser project");
      assert.ok(["expected", "skipped"].includes(test.status), `Unqualified test: ${spec.title} (${test.status})`);
      const results = test.results ?? [];
      assert.ok(results.length <= 1, `Retried test: ${spec.title}`);
      assert.ok(results.every(result => (result.retry ?? 0) === 0), `Retry index present: ${spec.title}`);
      if (test.status === "skipped") {
        const reason = (test.annotations ?? []).find(annotation => annotation.type === "skip")?.description;
        assert.ok(reason, `Unexplained skip: ${spec.title}`);
        assert.ok(!reason.includes("R8 external corpus is generated"), "Required external-corpus coverage is disabled");
        skipped += 1; skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      } else {
        assert.equal(test.expectedStatus, "passed", `Expected-failure test: ${spec.title}`);
        assert.equal(results.length, 1, `Test has no execution: ${spec.title}`);
        assert.equal(results[0].status, "passed", `Test did not pass: ${spec.title}`);
        assert.equal((results[0].errors ?? []).length, 0, `Test reports errors: ${spec.title}`);
        passed += 1;
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  assert.ok(passed > 0, "No tests passed");
  assert.equal(report.stats?.expected, passed, "Passed-test count disagrees with report statistics");
  assert.equal(report.stats?.skipped, skipped, "Skipped-test count disagrees with report statistics");
  assert.equal(report.stats?.unexpected, 0, "Unexpected browser failures");
  assert.equal(report.stats?.flaky, 0, "Flaky browser results");
  return { project, passed, skipped, failed: 0, retries: 0, flaky: 0, skipReasons };
}

async function findReports(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await findReports(path));
    else if (entry.name === "browser-results.json") result.push(path);
  }
  return result;
}

export async function certifyMatrix(directory, identity) {
  assert.match(identity.sourceSha ?? "", /^[0-9a-f]{40}$/, "Exact source SHA is required");
  const matrix = [];
  for (const channel of channels) for (const project of projects) {
    const artifact = join(directory, `pdf-browser-${channel}-${project}`);
    const reports = await findReports(artifact);
    assert.equal(reports.length, 1, `Expected exactly one report in ${artifact}`);
    matrix.push({ channel, ...summarizeReport(JSON.parse(await readFile(reports[0], "utf8")), project) });
  }
  return { schemaVersion: 1, ...identity, status: "AUTOMATED_RELEASE_MATRIX_PASS", matrix,
    totals: matrix.reduce((sum, row) => ({ passed: sum.passed + row.passed, skipped: sum.skipped + row.skipped }), { passed: 0, skipped: 0 }),
    limitations: ["Automated browser profiles do not certify physical devices or human usability.", "This certificate does not publish a release or attest deployment smoke tests."] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, output] = process.argv.slice(2);
  assert.ok(directory && output, "Usage: node certify-browser-matrix.mjs <artifact-directory> <output.json>");
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  const certificate = await certifyMatrix(resolve(directory), { sourceSha: process.env.GITHUB_SHA, version: pkg.version, runId: process.env.GITHUB_RUN_ID });
  await writeFile(output, JSON.stringify(certificate, null, 2) + "\n");
  console.log(JSON.stringify(certificate, null, 2));
}

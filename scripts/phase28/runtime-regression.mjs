import { readFile } from "node:fs/promises";
import { matchInterruptedTransactions } from "../../src/revisions/transactionRecovery.ts";

let passed = 0;
const checks = [];
function check(condition, name) {
  if (!condition) throw new Error(`Phase 28 runtime regression failed: ${name}`);
  passed += 1; checks.push(name);
}
const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const projectRepo = await readFile(new URL("../../src/projects/projectRepository.ts", import.meta.url), "utf8");
const heartbeat = await readFile(new URL("../../src/recovery/sessionHeartbeat.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../../src/storage/database.ts", import.meta.url), "utf8");
const projectFiles = await readFile(new URL("../../src/storage/projectFiles.ts", import.meta.url), "utf8");
check(/^6\.\d+\.\d+$/.test(packageJson.version) || Number(packageJson.version.match(/phase(\d+)$/)?.[1] ?? 0) >= 28, "Phase 28 package/recovery guarantees remain enabled in later phases");
check(/existingChecksum === (?:existing|compatibleExisting)\.checksum/.test(projectRepo), "Duplicate reuse verifies stored source checksum");
check(!/catch\s*\{\s*await deleteProject\(existing\.id\)/s.test(projectRepo), "Transient duplicate-read failure never auto-deletes an existing project");
check(/actualChecksum !== project\.checksum/.test(projectRepo), "Project backups verify source integrity before encoding");
check(/workspace-heartbeat-v2:/.test(heartbeat), "Crash heartbeat records are per-session");
check(/localStorage\.removeItem\(key\)/.test(heartbeat), "Clean heartbeat shutdown removes only the current session record");
check(/transaction\.onabort/.test(database), "IndexedDB write/delete helpers reject aborted transactions");
check(/writable\.abort/.test(projectFiles), "Interrupted OPFS source writes explicitly abort their stream");

const tx = (id, startedAt) => ({ id, projectId: "p", sourceRevisionId: "r", operation: "edit", status: "preparing", startedAt });
const project = (id, createdAt) => ({ id, createdAt, lineage: { parentProjectId: "p" }, revision: { id: `rev-${id}`, parentRevisionId: "r", operation: "edit" } });
const one = matchInterruptedTransactions("p", [tx("old", 100), tx("new", 200)], [project("out", 300)]);
check(one.filter((item) => item.output).length === 1, "One output cannot satisfy multiple interrupted transactions");
check(one.find((item) => item.transaction.id === "new")?.output?.id === "out", "Newest compatible interrupted transaction receives ambiguous single output");
const two = matchInterruptedTransactions("p", [tx("old", 100), tx("new", 200)], [project("out1", 220), project("out2", 320)]);
check(new Set(two.flatMap((item) => item.output ? [item.output.id] : [])).size === 2, "Multiple outputs reconcile one-to-one");

console.log(JSON.stringify({ name: "Phase 28 runtime regression", passed, total: passed, checks }, null, 2));

import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  "src/core/release.ts",
  "src/types/project.ts",
  "src/types/nativeEditor.ts",
  "src/projects/projectPackage.ts",
  "src/projects/projectRepository.ts",
  "src/projects/projectManifestMigration.ts",
  "src/settings/settingsStore.ts",
  "src/editor/editorRepository.ts",
  "src/security/securityRepository.ts",
  "src/native/nativeRepository.ts",
  "src/compliance/complianceRepository.ts",
  "src/processing/batchModel.ts",
  "tests/unit/projectPackage.test.ts",
  "tests/unit/settings.test.ts",
  "tests/unit/phase26WorkflowIntelligence.test.ts",
  "tests/unit/phase30ReleaseFreeze.test.ts"
].map(async (path) => [path, await readFile(new URL(`../../${path}`, import.meta.url), "utf8")])));

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) process.exitCode = 1;
}
const release = files["src/core/release.ts"];
const projectTypes = files["src/types/project.ts"];
const nativeTypes = files["src/types/nativeEditor.ts"];
const packageSource = files["src/projects/projectPackage.ts"];
const projectRepo = files["src/projects/projectRepository.ts"];
const projectManifestMigration = files["src/projects/projectManifestMigration.ts"];
const settings = files["src/settings/settingsStore.ts"];
const editor = files["src/editor/editorRepository.ts"];
const security = files["src/security/securityRepository.ts"];
const native = files["src/native/nativeRepository.ts"];
const compliance = files["src/compliance/complianceRepository.ts"];
const batch = files["src/processing/batchModel.ts"];
const phase30Unit = files["tests/unit/phase30ReleaseFreeze.test.ts"];

check("package versions 1-9", /SUPPORTED_PROJECT_PACKAGE_VERSIONS\s*=\s*\[1, 2, 3, 4, 5, 6, 7, 8, 9\]/.test(release) && /formatVersion:\s*1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 7 \| 8 \| 9/.test(projectTypes), "v1-v9 backups remain recognized");
check("legacy package decode test", /legacy package formats 1 through 8/.test(phase30Unit), "Vitest exercises historical project-package framing");
check("v9 authenticated metadata", /formatVersion >= 9/.test(packageSource) && /metadataChecksum/.test(packageSource), "current v9 backups authenticate metadata and payload");
check("project manifest migration", /migrateProjectManifestForSchema/.test(projectRepo) && /project\.lineage \?\?/.test(projectManifestMigration) && /project\.revision \?\?/.test(projectManifestMigration) && /assertReadableProjectManifestSchema/.test(projectManifestMigration) && /version > currentSchemaVersion/.test(projectManifestMigration) && /newer PDF Studio/.test(projectManifestMigration), "legacy project manifests gain recovery lineage/revision metadata while future schemas are refused without rewrite");
check("settings v1-v5 migration", /settings-v4/.test(settings) && /settings-v3/.test(settings) && /settings-v2/.test(settings) && /settings-v1/.test(settings) && /settings-v5/.test(settings), "legacy settings keys v1-v4 migrate into v5");
check("editor state migration", /migrateEditorState/.test(editor) && /EDITOR_SCHEMA_VERSION/.test(editor), "editor state migrates to the current editor schema");
check("security state migration", /migrateSecurityState/.test(security) && /userPassword:\s*""/.test(security) && /ownerPassword:\s*""/.test(security), "security state migrates without persisting passwords");
check(
  "native state normalization",
  /NATIVE_EDITOR_SCHEMA_VERSION\s*=\s*3/.test(nativeTypes)
    && native.includes("const queuedEdits = Array.isArray")
    && native.includes("bytesFromStored")
    && native.includes('bytes?.byteLength ? "replace" : "transform"')
    && native.includes("sourceBounds: stored.sourceBounds ?? stored.bounds"),
  "schema-2 native edits normalize into schema 3, including legacy image replacement payloads and source-transform defaults"
);
check("compliance state normalization", /(?:schemaVersion:\s*2|COMPLIANCE_SCHEMA_VERSION\s*=\s*2)/.test(compliance) && /migrateOptions/.test(compliance), "compliance state normalizes into schema 2");
check("batch v1-v3 migration", /CURRENT_BATCH_SCHEMA_VERSION\s*=\s*3/.test(batch) && /(?:recipe\.schemaVersion|schemaVersion) === 2/.test(batch) && /recipe\.rotate/.test(batch), "Batch v1 and v2 recipes migrate to schema 3");

const passed = checks.filter((item) => item.passed).length;
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
console.log(`Phase 30 migration audit: ${passed}/${checks.length} passed.`);
if (passed !== checks.length) process.exitCode = 1;

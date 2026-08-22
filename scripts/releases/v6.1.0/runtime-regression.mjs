import { readFile } from "node:fs/promises";

const checks = [];
function check(condition, name) {
  checks.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(`v6.1.0 intuitiveness regression failed: ${name}`);
}
const read = async (path) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(await read("package.json"));
const release = await read("src/core/release.ts");
const workspace = await read("src/workspace/workspaceRepository.ts");
const unifiedWorkspace = await read("src/workspace/UnifiedWorkspace.tsx");
const shell = await read("src/app/AppShell.tsx");
const viewer = await read("src/views/ViewerPage.tsx");
const editor = await read("src/views/EditorPage.tsx");
const nativePropsEntry = await read("src/editor/native/NativeContentPropertiesPanel.tsx");
const nativePropsLegacy = await read("src/editor/native/LegacyNativeContentPropertiesPanel.tsx");
const nativeProps = `${nativePropsEntry}\n${nativePropsLegacy}`;
const ocr = await read("src/views/OcrPage.tsx");
const organizer = await read("src/views/OrganizerPage.tsx");
const tools = await read("src/views/ToolsPage.tsx");
const documentTools = await read("src/views/DocumentToolsPage.tsx");
const taskCatalog = await read("src/ia/taskCatalog.ts");
const settings = await read("src/views/SettingsPage.tsx");
const help = await read("src/help/helpContent.ts");
const pwa = await read("src/components/PwaReadinessCard.tsx");
const nativeRoute = await read("src/views/NativeEditorPage.tsx");
const commandPalette = await read("src/components/CommandPalette.tsx");
const distAudit = await read("scripts/check-dist.mjs");
const browserCompatibility = await read("tests/e2e/browser-compatibility.spec.ts");

check(/^[67]\.\d+\.\d+$/.test(packageJson.version) && release.includes(`APP_VERSION = "${packageJson.version}"`), "historical v6 regression remains release-version synchronized on v6/v7");
check(/preservationOpen:\s*false/.test(workspace), "technical preservation details default closed");
check(/<details aria-label="Advanced & support" className="sidebar-advanced">/.test(shell) && /<summary>Support<\/summary>/.test(shell), "advanced support is progressively disclosed");
check(!/route:\s*\{ name: "diagnostics" \}/.test(shell) && !/route:\s*\{ name: "validation" \}/.test(shell) && !/route:\s*\{ name: "storage" \}/.test(shell), "engineering and release destinations stay out of normal support navigation");
check(/primaryModes:\s*WorkspaceMode\[\]\s*=\s*\["viewer",\s*"editor",\s*"organizer",\s*"toolbox"\]/.test(unifiedWorkspace) && /Read/.test(unifiedWorkspace) && /Edit/.test(unifiedWorkspace) && /Pages/.test(unifiedWorkspace) && /Tools/.test(unifiedWorkspace), "document navigation has four stable user destinations");
check(!/simpleModes|technicalModes|Show advanced tools|Simple workspace|Advanced workspace/.test(unifiedWorkspace), "workspace no longer exposes competing simple advanced or technical mode navigation");
check(/Download original PDF/.test(viewer) && /Back up project/.test(viewer) && !/>Edit PDF</.test(viewer) && !/>Organize</.test(viewer), "viewer toolbar avoids duplicate workspace navigation");
check(/toolGroups/.test(editor) && /Insert/.test(editor) && /Shapes/.test(editor) && /Markup/.test(editor) && /Mark redaction/.test(editor), "editor tools are grouped and redaction is clearly staged");
check(/not permanent yet/i.test(editor) && /Apply redactions/.test(editor), "redaction permanence warning remains visible");
check(/LegacyNativeContentPropertiesPanel/.test(nativePropsEntry) && /Technical details/.test(nativeProps) && /Directly editable/.test(nativeProps) && /pending change/.test(nativeProps), "existing-content editor uses plain capability language");
check(/Recognition quality/.test(ocr) && /Balanced \(recommended\)/.test(ocr) && /Advanced image cleanup/.test(ocr), "OCR defaults to understandable quality presets");
check(/selection-examples/.test(organizer) && /Pages 1–5/.test(organizer) && /All except 3/.test(organizer), "page selection provides clickable examples");
check(/taskCategories/.test(taskCatalog) && /Create & combine/.test(taskCatalog) && /Edit & annotate/.test(taskCatalog) && /Protect & sign/.test(taskCatalog) && /Convert & optimize/.test(taskCatalog) && /Review & accessibility/.test(taskCatalog), "canonical task catalog organizes tools by user intent");
check(/What do you want to do\?/.test(tools) && /Search PDF tasks/.test(tools) && /taskCategories/.test(tools) && !/Forms & Protect|Print & Advanced|Inspect PDF structure/.test(tools), "global tools page discovers outcomes rather than subsystem names");
check(/Current PDF/.test(documentTools) && /Document utilities/.test(documentTools) && /taskCategories/.test(documentTools), "current-document tools use the canonical task catalog");
check(/Find a PDF task/.test(commandPalette) && /remove metadata/.test(commandPalette) && /taskSearchText/.test(commandPalette) && !/workspaceModes/.test(commandPalette), "command palette searches tasks and synonyms rather than workspace modes");
check(!/Experience level/.test(settings) && !/setExperienceMode/.test(unifiedWorkspace), "global Simple Advanced experience navigation has been retired from the consumer UI");
check((help.match(/id:\s*"/g) ?? []).length >= 20 && /redaction/.test(help) && /print-advanced/.test(help) && /what-changes/.test(help) && /four stable destinations/.test(help), "offline help covers the reconstructed information architecture and advanced workflows");
check(/Prevent browser cleanup/.test(pwa), "persistent-storage action is described by its user outcome");
check(!/<p className="eyebrow">Phase 17<\/p>/.test(nativeRoute), "legacy compatibility route does not expose internal phase numbering");
check(packageJson.dependencies?.["pdfjs-dist"] === "5.4.624", "PDF.js remains pinned to the last release before Map upsert APIs became mandatory");
check(/getOrInsertComputed/.test(distAudit) && /FORBIDDEN_RUNTIME_APIS/.test(distAudit), "distribution audit rejects unsupported Map upsert APIs");
check(/deleteProperty\(Map\.prototype, "getOrInsertComputed"\)/.test(browserCompatibility) && /plain-text\.pdf/.test(browserCompatibility) && /PLAIN_PAGE_1_MARKER/.test(browserCompatibility), "browser regression opens a real PDF without Map upsert APIs");

const passed = checks.filter(item => item.passed).length;
console.log(JSON.stringify({ name: "v6.1.0 intuitiveness and discoverability regression", passed, total: checks.length, checks }, null, 2));

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
const shell = await read("src/app/AppShell.tsx");
const viewer = await read("src/views/ViewerPage.tsx");
const editor = await read("src/views/EditorPage.tsx");
const nativeProps = await read("src/editor/native/NativeContentPropertiesPanel.tsx");
const ocr = await read("src/views/OcrPage.tsx");
const organizer = await read("src/views/OrganizerPage.tsx");
const tools = await read("src/views/ToolsPage.tsx");
const help = await read("src/help/helpContent.ts");
const pwa = await read("src/components/PwaReadinessCard.tsx");
const nativeRoute = await read("src/views/NativeEditorPage.tsx");
const commandPalette = await read("src/components/CommandPalette.tsx");

check(packageJson.version === "6.1.0" && release.includes('APP_VERSION = "6.1.0"'), "version synchronization");
check(/preservationOpen:\s*false/.test(workspace), "technical preservation details default closed");
check(/Simple/.test(shell) || /Advanced & support/.test(shell), "advanced support is progressively disclosed");
check(/Advanced & support/.test(shell) && !/label: "Activity"/.test(shell), "engineering destinations removed from primary navigation");
check(/Download original PDF/.test(viewer) && /Back up project/.test(viewer) && !/>Edit PDF</.test(viewer) && !/>Organize</.test(viewer), "viewer toolbar avoids duplicate workspace navigation");
check(/toolGroups/.test(editor) && /Insert/.test(editor) && /Shapes/.test(editor) && /Markup/.test(editor) && /Mark redaction/.test(editor), "editor tools are grouped and redaction is clearly staged");
check(/not permanent yet/i.test(editor) && /Apply redactions/.test(editor), "redaction permanence warning remains visible");
check(/Technical details/.test(nativeProps) && /Directly editable/.test(nativeProps) && /pending change/.test(nativeProps), "existing-content editor uses plain capability language");
check(/Recognition quality/.test(ocr) && /Balanced \(recommended\)/.test(ocr) && /Advanced image cleanup/.test(ocr), "OCR defaults to understandable quality presets");
check(/selection-examples/.test(organizer) && /Pages 1–5/.test(organizer) && /All except 3/.test(organizer), "page selection provides clickable examples");
check(/Advanced tools/.test(tools) && /Forms & Protect/.test(tools) && /Print & Advanced/.test(tools) && !/Compare 3\.0|Creator 2\.0|Phase 18/.test(tools), "tools page uses consistent user-facing vocabulary");
check((help.match(/id:\s*"/g) ?? []).length >= 20 && /redaction/.test(help) && /print-advanced/.test(help) && /what-changes/.test(help), "offline help covers major everyday and advanced workflows");
check(/Prevent browser cleanup/.test(pwa), "persistent-storage action is described by its user outcome");
check(!/<p className="eyebrow">Phase 17<\/p>/.test(nativeRoute), "legacy compatibility route does not expose internal phase numbering");
check(/Download history/.test(commandPalette) && /App self-check/.test(commandPalette) && /Troubleshooting & recovery/.test(commandPalette), "command palette matches canonical navigation vocabulary");

const passed = checks.filter(item => item.passed).length;
console.log(JSON.stringify({ name: "v6.1.0 intuitiveness and discoverability regression", passed, total: checks.length, checks }, null, 2));

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classifyDocumentBudget, performanceBudgetFor } from "../../src/viewer/performancePolicy.ts";

const root = resolve(new URL("../..", import.meta.url).pathname);
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) process.exitCode = 1;
}
function contrast(a, b) {
  const luminance = (hex) => {
    const rgb = hex.replace("#", "").match(/.{2}/g).map((value) => parseInt(value, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}

const styles = await readFile(resolve(root, "src/styles.css"), "utf8");
const shell = await readFile(resolve(root, "src/app/AppShell.tsx"), "utf8");
const viewer = await readFile(resolve(root, "src/views/ViewerPage.tsx"), "utf8");
const workspace = await readFile(resolve(root, "src/workspace/UnifiedWorkspace.tsx"), "utf8");
const palette = await readFile(resolve(root, "src/components/CommandPalette.tsx"), "utf8");
const modal = await readFile(resolve(root, "src/accessibility/modalFocus.ts"), "utf8");

check("normal budget", classifyDocumentBudget(20, 2_000_000) === "normal", "small documents remain normal");
check("large budget", classifyDocumentBudget(300, 20_000_000) === "large", "250+ pages enters large mode");
check("extreme budget", classifyDocumentBudget(1000, 20_000_000) === "extreme", "1000+ pages enters extreme mode");
const extreme = performanceBudgetFor("extreme");
check("extreme render concurrency", extreme.maxConcurrentRenders === 1, "extreme documents serialize render work");
check("extreme pixel density", extreme.maxPixelRatio <= 1.25, "extreme canvases have a strict pixel-ratio ceiling");
check("light accent contrast", contrast("#b83d34", "#f7f5f0") >= 4.5, `contrast=${contrast("#b83d34", "#f7f5f0").toFixed(2)}`);
check("dark hero accent contrast", contrast("#ff8276", "#15191e") >= 4.5, `contrast=${contrast("#ff8276", "#15191e").toFixed(2)}`);
check("warning text contrast", contrast("#87580f", "#f7f5f0") >= 4.5, `contrast=${contrast("#87580f", "#f7f5f0").toFixed(2)}`);
check("light muted contrast", contrast("#66707c", "#f7f5f0") >= 4.5, `contrast=${contrast("#66707c", "#f7f5f0").toFixed(2)}`);
check("route focus", /focus\(\{ preventScroll: true \}\)/.test(shell) && /aria-live="polite"/.test(shell), "SPA route changes focus and announce the new surface");
check("settings in mobile nav", /\["home", "projects", "tools", "settings", "help"\]/.test(shell), "mobile global navigation exposes Settings instead of Activity");
check("modal focus trap", /event\.key !== "Tab"/.test(modal) && /event\.key === "Escape"/.test(modal) && /previous\?\.isConnected/.test(modal), "modal focus traps Tab, closes on Escape, and restores origin focus");
check("command dialog semantics", /aria-modal="true"/.test(palette) && /aria-labelledby="command-palette-title"/.test(palette), "command palette is a labelled modal dialog");
check("viewer semantics", /aria-label="Previous page"/.test(viewer) && /role="tabpanel"/.test(viewer) && /role="alert"/.test(viewer), "viewer toolbar/sidebar/error semantics are explicit");
check("workspace keyboard tabs", /ArrowLeft/.test(workspace) && /ArrowRight/.test(workspace) && /tabIndex=\{tab\.projectId === projectId \? 0 : -1\}/.test(workspace), "document tabs implement roving keyboard navigation");
check("coarse pointer targets", /@media \(pointer: coarse\)/.test(styles) && /min-height: 44px/.test(styles), "coarse-pointer controls enforce 44px targets");
check("200 percent zoom layout", /@media \(max-width: 640px\)/.test(styles) && /grid-template-columns: 1fr !important/.test(styles), "compressed CSS widths collapse multi-column content");
check("contrast preferences", /prefers-contrast: more/.test(styles) && /forced-colors: active/.test(styles), "higher-contrast and forced-colors modes have explicit support");
check("reduced motion", /prefers-reduced-motion: reduce/.test(styles), "system reduced-motion preference remains honored");
check("thumbnail containment", /\.thumbnail \{ contain-intrinsic-size:/.test(styles), "off-screen thumbnails can skip rendering/layout work");

const passed = checks.filter((item) => item.passed).length;
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
console.log(`Phase 29 runtime regression: ${passed}/${checks.length} passed.`);
if (passed !== checks.length) process.exitCode = 1;

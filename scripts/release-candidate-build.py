from pathlib import Path
import re


def edit(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    assert text.count(old) == count, f'{path}: expected {count} matches for {old[:120]!r}, got {text.count(old)}'
    p.write_text(text.replace(old, new))


def add(path, text):
    p = Path(path)
    assert not p.exists(), path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


edit('src/accessibility/modalFocus.ts',
     '        if (target?.isConnected) target.focus({ preventScroll: true });',
     '''        // A user may already have followed a skip link or focused another control.
        // Delayed restoration must not undo that newer, intentional focus change.
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected
          && !container.contains(focused) && focused !== target && focused !== previous) return;
        if (target?.isConnected) target.focus({ preventScroll: true });''')

edit('src/views/EditorPage.tsx',
     '<div className="editor-file-group"><span className="editor-purpose">Edit your PDF</span></div>',
     '''<div className="editor-file-group"><span className="editor-purpose">Edit your PDF</span><span className="editor-runtime-status">{status} · {detectedPdfItemCount} PDF item{detectedPdfItemCount === 1 ? "" : "s"} · {history.present.objects.length} added object{history.present.objects.length === 1 ? "" : "s"}</span></div>''')
edit('src/views/EditorPage.tsx',
     '<div className="editor-notices">',
     '''<div className="editor-notices">
        {status !== "Ready" && status !== "Opening PDF…" ? <p aria-label="Document status" className="editor-operation-status" role="status">{status}</p> : null}''')

edit('src/App.tsx', '<CapabilityGatedWorkspace mode={route.mode}', '<CapabilityGatedWorkspace key={route.projectId} mode={route.mode}')
edit('src/App.tsx', '<UnifiedWorkspace mode={documentRouteMode(route)}', '<UnifiedWorkspace key={route.projectId} mode={documentRouteMode(route)}')

add('src/viewer/restorePreferences.ts', '''import type { ViewerPreferences } from "../types/project";

export type ViewerPreferenceChanges = Partial<Pick<ViewerPreferences,
  "pageNumber" | "zoom" | "viewMode" | "sidebarTab" | "sidebarOpen">>;

/** Late storage reads must never overwrite choices made since this view opened. */
export function restoreViewerPreferences(
  saved: ViewerPreferences | undefined,
  current: ViewerPreferences,
  changes: ViewerPreferenceChanges,
  pageCount: number,
  compact: boolean
): ViewerPreferences {
  const merged = { ...current, ...saved, ...(compact ? { sidebarOpen: false } : {}), ...changes };
  return {
    ...merged,
    projectId: current.projectId,
    pageNumber: Math.max(1, Math.min(Math.max(1, pageCount), Math.round(Number.isFinite(merged.pageNumber) ? merged.pageNumber : 1))),
    zoom: Math.max(0.25, Math.min(4, Number.isFinite(merged.zoom) ? merged.zoom : 1)),
    viewMode: merged.viewMode === "single" ? "single" : "continuous",
    sidebarTab: ["pages", "outline", "search", "info"].includes(merged.sidebarTab) ? merged.sidebarTab : "pages",
    sidebarOpen: merged.sidebarOpen !== false
  };
}
''')

p = 'src/views/ViewerPage.tsx'
edit(p, 'import { PageCanvas } from "../viewer/PageCanvas";', 'import { PageCanvas } from "../viewer/PageCanvas";\nimport { restoreViewerPreferences, type ViewerPreferenceChanges } from "../viewer/restorePreferences";')
edit(p, '  const documentRef = useRef<PDFDocumentProxy | null>(null);', '''  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const openingSequenceRef = useRef(0);
  const preferenceChangesRef = useRef<ViewerPreferenceChanges>({});
  const stageRef = useRef<HTMLElement | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);''')
s = Path(p).read_text(); assert 'isPhoneViewport' in s
Path(p).write_text(s.replace('isPhoneViewport', 'isCompactReaderViewport').replace('(max-width: 680px)', '(max-width: 1100px)'))
edit(p, '    hydrationRef.current?.cancel();\n    hydrationRef.current = null;\n    setLoading(true); setError(null); setStatus("Opening PDF…");', '''    const openingSequence = ++openingSequenceRef.current;
    hydrationRef.current?.cancel();
    hydrationRef.current = null;
    preferenceChangesRef.current = {};
    setPreferencesLoaded(false);
    setPdfDocument(null);
    setLoading(true); setError(null); setStatus("Opening PDF…");''')
edit(p, '      const doc = await openPdfWithPdfJs(bytes, suppliedPassword);', '''      if (openingSequence !== openingSequenceRef.current) return;
      const doc = await openPdfWithPdfJs(bytes, suppliedPassword);
      if (openingSequence !== openingSequenceRef.current) { await doc.loadingTask.destroy(); return; }''')
edit(p, '''        if (savedPreferences) {
          const normalized = normalizePreferences(savedPreferences, doc.numPages);
          setPreferences(isCompactReaderViewport() ? { ...normalized, sidebarOpen: false } : normalized);
        }''', '''        setPreferences((current) => restoreViewerPreferences(savedPreferences, current, preferenceChangesRef.current, doc.numPages, isCompactReaderViewport()));
        setPreferencesLoaded(true);''')
edit(p, '''    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message))''', '''    } catch (reason) {
      if (openingSequence !== openingSequenceRef.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message))''')
edit(p, '      cancelled = true;\n      hydrationRef.current?.cancel();', '      cancelled = true;\n      ++openingSequenceRef.current;\n      hydrationRef.current?.cancel();')
edit(p, '    if (!pdfDocument || readOnly) return;', '    if (!pdfDocument || !preferencesLoaded || readOnly) return;')
edit(p, 'saveTimerRef.current = window.setTimeout(() => { void writeViewerPreferences({ ...preferences, updatedAt: Date.now() }); }, 350);', 'saveTimerRef.current = window.setTimeout(() => { void writeViewerPreferences({ ...preferences, updatedAt: Date.now() }).catch(() => setError("Reading preferences could not be saved locally. Your PDF is unchanged.")); }, 350);')
edit(p, '  }, [pdfDocument, preferences, readOnly]);', '  }, [pdfDocument, preferences, preferencesLoaded, readOnly]);')
edit(p, '  const changePreferences = useCallback((patch: Partial<ViewerPreferences>) => setPreferences((current) => ({ ...current, ...patch, updatedAt: Date.now() })), []);', '''  const changePreferences = useCallback((patch: ViewerPreferenceChanges) => {
    Object.assign(preferenceChangesRef.current, patch);
    setPreferences((current) => ({ ...current, ...patch, updatedAt: Date.now() }));
  }, []);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;''')
edit(p, '  const handlePageVisible = useCallback((pageNumber: number) => changePreferences({ pageNumber }), [changePreferences]);', '''  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !pdfDocument || !preferencesLoaded || preferences.viewMode !== "continuous") return;
    let frame = 0;
    const pages = Array.from(stage.querySelectorAll<HTMLElement>(".pdf-page-shell[data-page-number]"));
    const updateVisiblePage = () => {
      frame = 0;
      const readingLine = stage.getBoundingClientRect().top + Math.min(32, stage.clientHeight / 4);
      // Page preloading extends well outside the viewport. Reading position must
      // follow the visible page, not the last page admitted to the render queue.
      let low = 0, high = pages.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (pages[middle].getBoundingClientRect().bottom <= readingLine) low = middle + 1;
        else high = middle;
      }
      const pageNumber = Number(pages[Math.min(low, pages.length - 1)]?.dataset.pageNumber);
      if (Number.isFinite(pageNumber) && pageNumber !== preferencesRef.current.pageNumber) changePreferences({ pageNumber });
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(updateVisiblePage); };
    const restoreFrame = window.requestAnimationFrame(() => {
      pages.find((page) => Number(page.dataset.pageNumber) === preferencesRef.current.pageNumber)?.scrollIntoView({ block: "start" });
      stage.addEventListener("scroll", onScroll, { passive: true });
    });
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      if (frame) window.cancelAnimationFrame(frame);
      stage.removeEventListener("scroll", onScroll);
    };
  }, [changePreferences, pdfDocument, preferencesLoaded, preferences.viewMode]);''')
edit(p, 'async function retryPassword(): Promise<void> { if (project && bytesRef.current && password)', 'async function retryPassword(): Promise<void> { if (!loading && project && bytesRef.current && password)')
edit(p, '<div className="viewer-app viewer-app--r3">', '<div className="viewer-app viewer-app--r3" data-preferences-ready={preferencesLoaded ? "true" : "false"}>')
edit(p, '{error ? <div aria-live="assertive" className="viewer-error"', '{error && !passwordRequired ? <div aria-live="assertive" className="viewer-error"')
edit(p, '<p id="viewer-password-description">The password is kept in memory only for this viewing session.</p>', '<p id="viewer-password-description">The password is kept in memory only for this viewing session.</p><form onSubmit={(event) => { event.preventDefault(); void retryPassword(); }}>{error ? <p role="alert">{error}</p> : null}')
edit(p, 'disabled={!password} onClick={() => void retryPassword()} type="button">Open locally</button>', 'disabled={!password || loading} type="submit">{loading ? "Opening…" : "Open locally"}</button>')
edit(p, 'onClick={closePasswordDialog} type="button">Cancel</button></div></div></div>', 'onClick={closePasswordDialog} type="button">Cancel</button></div></form></div></div>')
edit(p, '<main aria-label="PDF document pages" className="document-stage">', '<main aria-label="PDF document pages" className="document-stage" ref={stageRef}>')
edit(p, 'onVisible={handlePageVisible} ', '')
s = Path(p).read_text()
s, count = re.subn(r'function normalizePreferences\(preferences: ViewerPreferences, pageCount: number\): ViewerPreferences \{.*?\n\}', '', s, flags=re.S)
assert count == 1
Path(p).write_text(s)

css = Path('src/product/refinements.css')
css.write_text(css.read_text() + '''
/* Reader and feedback corrections verified against the release regression suite. */
.product-app .viewer-sidebar { grid-template-rows:auto minmax(0,1fr); }
.product-app .editor-runtime-status { font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.product-app .editor-operation-status { margin:0; padding:8px 14px; font-size:13px; overflow-wrap:anywhere; }
@media (max-width:1100px) {
  .product-app .viewer-mobile-panel-toggle { display:inline-flex; align-items:center; min-height:44px; white-space:nowrap; }
  .product-app .viewer-commandbar { grid-template-columns:minmax(0,1fr); }
  .product-app .viewer-file-group { display:none; }
  .product-app .viewer-commandbar__center { overflow-x:auto; max-width:100%; justify-content:flex-start; }
  .product-app .viewer-commandbar__center > * { flex-shrink:0; }
  .product-app .viewer-layout,.product-app .viewer-layout--collapsed { display:block; position:relative; }
  .product-app .document-stage { height:100%; }
  .product-app .viewer-sidebar { position:absolute; z-index:35; left:0; top:0; bottom:0; width:min(310px,82vw); height:100%; box-shadow:var(--shadow); }
  .product-app .viewer-layout--collapsed .viewer-sidebar { display:none; }
  .product-app .sidebar-collapse { display:none; }
  .product-app .viewer-commandbar button,.product-app .viewer-commandbar select { min-height:44px; }
}
''')

edit('tests/e2e/p35-compare-safety.spec.ts', 'name: "Compare documents"', 'name: "Find differences"', count=2)
edit('tests/e2e/phase16.spec.ts', '  await switchMode(duplicate, "editor");', '''  // This path intentionally cannot reach an editor: another tab owns it.
  await duplicate.getByRole("button", { name: "Document actions", exact: true }).click();
  await duplicate.getByRole("dialog", { name: "Document actions", exact: true }).getByRole("button", { name: /^Edit PDF/ }).click();''')
edit('tests/e2e/phase17.spec.ts', '  await expect(page.getByRole("checkbox", { name: "PDF content", exact: true })).toBeChecked();', '  await page.locator(".editor-guides summary").click();\n  await expect(page.getByRole("checkbox", { name: "PDF content", exact: true })).toBeChecked();')
edit('tests/e2e/phase26.spec.ts', '''  await expect(page.getByLabel("Mode").locator('option[value="visual"]')).toHaveText("Visual pixels");
  await expect(page.getByLabel("Mode").locator('option[value="text"]')).toHaveText("Extracted text");''', '''  const inputs = page.locator('.compare-inputs input[type="file"]');
  const fixture = "tests/corpus/phase28/dense-text-01.pdf";
  await inputs.nth(0).setInputFiles(fixture);
  await expect(page.locator(".compare-inputs .file-slot").nth(0)).toContainText("dense-text-01.pdf");
  await inputs.nth(1).setInputFiles(fixture);
  await expect(page.getByLabel("Mode")).toBeVisible();
  await expect(page.getByLabel("Mode").locator('option[value="visual"]')).toHaveText("Page appearance");
  await expect(page.getByLabel("Mode").locator('option[value="text"]')).toHaveText("Text changes");''')

add('tests/unit/restoreViewerPreferences.test.ts', '''import { describe, expect, it } from "vitest";
import type { ViewerPreferences } from "../../src/types/project";
import { restoreViewerPreferences } from "../../src/viewer/restorePreferences";
const defaults: ViewerPreferences = { projectId: "current", pageNumber: 1, zoom: 1, viewMode: "continuous", sidebarTab: "pages", sidebarOpen: true, updatedAt: 1 };
describe("reader preference restoration", () => {
  it("restores saved reading state without writing defaults over it", () => {
    const result = restoreViewerPreferences({ ...defaults, pageNumber: 7, zoom: 1.75, viewMode: "single" }, defaults, {}, 20, false);
    expect(result).toMatchObject({ pageNumber: 7, zoom: 1.75, viewMode: "single" });
  });
  it("preserves actions made before a delayed storage read completes", () => {
    const result = restoreViewerPreferences({ ...defaults, pageNumber: 7, zoom: 1.75 }, defaults, { pageNumber: 3, zoom: 2, sidebarTab: "search" }, 20, false);
    expect(result).toMatchObject({ pageNumber: 3, zoom: 2, sidebarTab: "search" });
  });
  it("keeps compact readers uncluttered unless the user explicitly opens the panel", () => {
    expect(restoreViewerPreferences(defaults, defaults, {}, 10, true).sidebarOpen).toBe(false);
    expect(restoreViewerPreferences(defaults, defaults, { sidebarOpen: true }, 10, true).sidebarOpen).toBe(true);
  });
  it("bounds invalid data and never restores another project identity", () => {
    const saved = { ...defaults, projectId: "other", pageNumber: 900, zoom: NaN, viewMode: "bad", sidebarTab: "bad" } as unknown as ViewerPreferences;
    expect(restoreViewerPreferences(saved, defaults, {}, 3, false)).toMatchObject({ projectId: "current", pageNumber: 3, zoom: 1, viewMode: "continuous", sidebarTab: "pages" });
  });
});
''')

add('tests/e2e/release-reader-state.spec.ts', '''import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/taskFirst";

test("reader restores page, scale, view and panel after reload", async ({ page }) => {
  await openSample(page);
  const reader = page.locator('.viewer-app[data-preferences-ready="true"]');
  await expect(reader).toBeVisible();
  await page.getByRole("button", { name: "Single", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Current page", exact: true }).fill("2");
  await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("1.75");
  await page.getByRole("combobox", { name: "Reader panel", exact: true }).selectOption("info");
  await expect(page.locator('.pdf-page-shell[data-page-number="2"]')).toBeVisible();
  await page.waitForTimeout(700); // exercise the documented debounced storage write
  await page.reload();
  await expect(reader).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue("2");
  await expect(page.getByRole("combobox", { name: "Zoom", exact: true })).toHaveValue("1.75");
  await expect(page.getByRole("combobox", { name: "Reader panel", exact: true })).toHaveValue("info");
  await expect(page.locator(".pdf-page-shell")).toHaveCount(1);
});

test("preloaded pages do not falsely advance reading position", async ({ page }) => {
  await openSample(page);
  await expect(page.locator('.viewer-app[data-preferences-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Continuous", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Current page", exact: true }).fill("1");
  await expect(page.locator('.pdf-page-shell[data-page-number="1"][data-rendered="true"]')).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue("1");
  await page.locator('.pdf-page-shell[data-page-number="2"]').evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(page.getByRole("spinbutton", { name: "Current page", exact: true })).toHaveValue("2");
});

test("modal restoration does not steal a newer skip-link focus", async ({ page }) => {
  await page.goto("./#/home");
  await page.getByRole("button", { name: "Open command palette", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Find a PDF task", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const skip = page.getByRole("link", { name: "Skip to main content", exact: true });
  await skip.focus();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(skip).toBeFocused();
});
''')

# Both qualification paths retain their existing scopes and output assertions.
edit('.github/workflows/task-first-redesign.yml', 'tests/e2e/release-interactions.spec.ts ', 'tests/e2e/release-interactions.spec.ts tests/e2e/release-reader-state.spec.ts ')
# Compact machine-readable summaries make failures reviewable without multi-GB traces.
edit('.github/workflows/release-completion.yml', '      - uses: actions/upload-artifact@v4\n        if: always()\n        with:\n          name: pdf-release-${{ matrix.project }}', '''      - name: Summarize actual browser results
        if: always()
        run: |
          python - <<'PY'
          import json, pathlib
          p = pathlib.Path('/tmp/browser-results.json')
          if not p.exists():
              raise SystemExit('Browser results were not produced')
          data = json.loads(p.read_text())
          print('RESULT_STATS', json.dumps(data.get('stats', {})))
          def visit(suite):
              for spec in suite.get('specs', []):
                  for test in spec.get('tests', []):
                      if test.get('status') != 'expected':
                          errors = [e.get('message', '') for result in test.get('results', []) for e in result.get('errors', [])]
                          print('RESULT_CASE', json.dumps({'file': spec.get('file'), 'title': spec.get('title'), 'status': test.get('status'), 'project': test.get('projectName'), 'errors': errors}))
              for child in suite.get('suites', []): visit(child)
          for suite in data.get('suites', []): visit(suite)
          PY
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: pdf-release-${{ matrix.project }}''')

Path('.github/workflows/release-candidate-patch.yml').unlink()
Path('scripts/release-candidate-build.py').unlink()
print('Source corrections applied; temporary preparation files removed.')

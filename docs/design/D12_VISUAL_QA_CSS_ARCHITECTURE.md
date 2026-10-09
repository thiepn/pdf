# D12 — Visual QA and CSS architecture cleanup

**Implementation branch:** `design/d12-visual-qa-css-cleanup` (stacked on D11).  
**Release status:** NOT QUALIFIED until all acceptance evidence is reviewed.

## Evidence-driven defects found in D11

1. **CI false-negative (real blocker).** D11's `tests/unit/studioDesignD11.test.mjs` imported CSS with `?raw` in a Vitest Node test runner; all imported CSS sources were empty in [the failing main CI run](https://github.com/thiepn/pdf/actions/runs/37857143164), causing four design-system tests to fail. D12 uses `node:fs` to read actual repository files deterministically.
2. **Tablet toolbar overlap (actual Chromium image).** The D3 qualification artifact `d3-live-editor-chromium`, screenshot `d3-integrated-tablet.png`, shows the edit buttons compressed and overlapping around 834px. D12 moves responsive overflow ownership out of D3 and gives the primary row a bounded horizontal scroller while preserving `More tools` and `Shortcuts` outside it. All individual buttons remain natural width and at least 44px high.
3. **Desktop PDF squeezed by recommendations (actual Chromium image).** `d3-integrated-desktop.png` shows the local recommendations consuming around a quarter of the viewport before the first visible PDF content. D12 limits the source-backed recommendation area to `min(168px, 22dvh)`, keeping actions accessible through normal scrolling. No warnings are deleted, no capability policy is changed.
4. **Legacy cascade debt.** `src/styles.css`, `document.css`, `refinements.css` and D3 had overlapping editor rules. Only the demonstrated contradictory D3 tablet rules are removed in this phase; wholesale legacy deletion would risk viewer, native-editor and security screens. D12 creates explicit ownership and a unit-test policy against adding PDF canvas transformations or unscoped high-priority presentation overrides.

## Files and ownership

| Owner | Responsibility |
|---|---|
| `studio-editor-d3-live.css` | Real editor desktop/phone styling; tablet overflow conflict removed |
| `studio-visual-qa-d12.css` | Correct tablet toolbar layout; bound desktop recommendation height; stage/panel shadow harmonization |
| `studio-tokens-d11.css` and `studio-chrome-d11.css` | Shared visual vocabulary and global application chrome remain authoritative |
| `product.css` | D12 stylesheet imported exactly once, last |
| `tests/unit/studioDesignD11.test.mjs` | Source assertions now read the real CSS via `node:fs` |
| `tests/unit/studioDesignD12.test.mjs` | Import order, scoped ownership, forbidden risky CSS patterns, preservation checks |
| `tests/e2e/d12-visual-qa.spec.ts` | Real PDF at 820/834/1024 tablet, 1440 desktop, and 390/320 mobile widths, including screenshots |
| `.github/workflows/d12-visual-qa.yml` | Three-engine browser matrix plus focused Vitest/TypeScript checks and evidence uploads |

## Visual QA acceptance

- No action-button overlap at 820, 834 or 1024px; first-row tools scroll independently; `More tools` remains directly reachable.
- Actual page canvas remains accessible on desktop and tablet and is not displaced by tall recommendations.
- At 390 and 320px, the editor retains canvas, document status, panel dock and accessible Layers sheet without document-wide overflow.
- Light/dark screenshots and Playwright traces are available for human review. Screenshots alone do not constitute a passed visual audit.
- Existing native edit, security, redaction, export, recovery and PDF fidelity gates are unchanged.
- No release claim is permitted from a passing stylesheet/test alone. D8's human/browser/evidence gate and P17/P18 fidelity qualification stay independent.

## Commands

```sh
npm run typecheck
npx vitest run tests/unit/studioDesignD11.test.mjs tests/unit/studioDesignD12.test.mjs
npx playwright test tests/e2e/d12-visual-qa.spec.ts --project=chromium --project=firefox --project=webkit
python scripts/design/d9_live_mount_audit.py --repo .
python scripts/design/d8_live_gate.py --evidence docs/design/D8_RELEASE_EVIDENCE.template.json
```

**No merge to `main` or production deploy is authorized by this document.**

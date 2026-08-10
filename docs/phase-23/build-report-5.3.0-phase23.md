# Build Report — 5.3.0-phase23

## Scope

Phase 23 improves phone/tablet usability without changing the static GitHub Pages/PWA architecture or adding a backend/native host.

## Implemented release hardening

- VisualViewport-based app height and keyboard inset manager.
- Phone workspace bottom navigation and More sheet.
- Viewer pages/search/outline/info phone bottom sheet.
- Editor bottom-sheet panels, compact defaults, larger touch handles, and pinch-zoom browser boundary.
- Safe-area-aware controls and keyboard-open layout behavior.
- Tablet-specific density adjustments and dedicated touch browser configuration.
- Phone Chromium + tablet WebKit Playwright projects isolated to mobile-specific E2E tests.

## Validation evidence

- Phase 11 runtime: **15/15**
- External-reader corpus: **11/11 PDFs**
- Phase 16 / 17 / 18 / 19 / 20 / 21 / 22 / 23 regressions: **all green**
- Phase 23 runtime: **8/8**
- GitHub Pages readiness audit: **18 pass / 0 fail**
- Production source audit: **173 source files / 522 relative imports**
- TS/TSX parser sweep: **211/211**
- GitHub Actions YAML parse: **4/4**

## Stable-label boundary

The exact lockfile-derived GitHub CI matrix from Phase 22 remains mandatory. It must run `npm ci`, TypeScript, Vitest, Vite, desktop Chromium/Firefox/WebKit, and the Phase 23 phone Chromium/tablet WebKit responsive projects. Phase 23 does not weaken that requirement or fabricate dependency evidence.

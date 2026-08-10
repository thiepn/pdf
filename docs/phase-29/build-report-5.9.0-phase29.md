# Build Report — 5.9.0-phase29

Phase 29 is the feature-frozen final UX/accessibility/performance-polish release candidate before Phase 30 release freeze.

## Completed qualification in this environment

- Phase 11 dependency-independent runtime: **15/15**.
- Phase 11 external-reader corpus: **11/11 PDFs**.
- Historical Phase 16–29 runtime regression chain: **all passing in one clean run**.
- Phase 28 adversarial PDF corpus: **56/56 PDFs** with dual-reader plus render validation.
- Phase 29 accessibility/performance runtime regression: **20/20**.
- Offline TypeScript semantic gate: **PASS**.
- Production source audit: **192 source files / 575 internal imports / 0 failures**.
- GitHub Pages/PWA readiness: **27 pass / 0 fail / 1 expected missing-lock warning**.
- TS/TSX syntax parser sweep: **243/243**.
- GitHub Actions YAML parse: **4/4**.
- No `node_modules`, `dist`, Playwright report, test-result directory, or fabricated `package-lock.json` is retained in the release tree.

## Material Phase 29 fixes

- Reusable focus trap/restore behavior for modal surfaces.
- SPA route focus and polite route announcements.
- Arrow/Home/End navigation for document tabs.
- Viewer toolbar/sidebar/error semantics and explicit labels.
- Light-surface and dark-hero contrast tokens separated so one accessibility fix cannot degrade the other.
- Create PDF Studio focus-ring regression fixed.
- Coarse-pointer targets, forced-colors/high-contrast support, 320 px/200%-zoom collapse behavior, and reduced-motion coverage hardened.
- 1,000+ page or approximately 500 MB documents enter an extreme render budget: serialized renders, <=1.25 device-pixel scale, tighter activation range, and more aggressive off-screen eviction.

## Exact dependency/browser boundary

The local runtime is the Phase 27 target toolchain: **Node 22.16.0 / npm 10.9.2**. Exact lock generation was attempted again. The configured environment registry returns `404` for pinned `@playwright/test@1.62.0`; a direct public npm registry attempt timed out. No dependency was substituted and no lockfile was fabricated.

Stable promotion therefore remains blocked until GitHub generates the committed npm lock and passes `npm ci`, TypeScript, Vitest, Vite reproducibility, the desktop Chromium/Firefox/WebKit matrix, phone Chromium, tablet WebKit, and deployed offline-PWA checks.

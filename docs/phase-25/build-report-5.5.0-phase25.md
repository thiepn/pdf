# Build Report — 5.5.0-phase25

## Release

- Version: `5.5.0-phase25`
- Channel: release candidate
- Target: static GitHub Pages + installable PWA
- Backend: none
- Required native host: none

## Implemented

- Create PDF Studio with Markdown/plain-text/semantic-HTML inputs;
- metric A4/A5/custom pagination and reusable creator presets;
- searchable Latin/CJK MuPDF PDF generation with post-generation PDF reopen/page-count validation;
- browser-shaped visual raster compatibility output with explicit searchability boundary;
- Compare 2.0 page-sequence alignment with precomputed page fingerprints;
- portable Batch recipe JSON import/export;
- Phase 25 runtime/unit/E2E and release-gate integration.

## Dependency-independent validation

- Phase 11 runtime regression: **15/15**
- External-reader corpus: **11/11 PDFs**
- Phase 16 runtime regression: **4/4**
- Phase 17 runtime regression: **10/10**
- Phase 18 runtime regression: **23/23**
- Phase 19 runtime regression: **21/21**
- Phase 20 runtime regression: **20/20**
- Phase 21 runtime regression: **19/19**
- Phase 22 runtime regression: **6/6**
- Phase 23 runtime regression: **8/8**
- Phase 24 runtime regression: **12/12**
- Phase 25 runtime regression: **12/12**
- Offline TypeScript semantic check: **PASS**
- Production source audit: **189 source files / 563 relative imports resolved**
- GitHub Pages/PWA readiness: **24 pass / 1 expected lockfile warning / 0 failures**
- TS/TSX syntax parser sweep (`src`, `tests`, `scripts`): **233/233**
- GitHub Actions YAML parse: **4/4**
- Production placeholder scan: **0**

## Official dependency gate

Exact `package-lock.json` generation was attempted without changing dependency versions. The configured execution-environment npm mirror returned HTTP 404 for pinned `@playwright/test@1.62.0`. A second attempt against the public npm registry timed out. No lockfile was fabricated and no package version was substituted.

The GitHub-hosted `Bootstrap dependency lock` workflow remains the supported route for generating the exact graph, followed by the official `npm ci`, TypeScript, Vitest, Vite/distribution, Chromium/Firefox/WebKit, phone/tablet, offline-PWA, and deployed Pages smoke gates.

## Stable-label boundary

This source archive is a Phase 25 release candidate. Promote it to stable only after the exact GitHub-generated lockfile is committed and the complete lockfile-derived release matrix passes.

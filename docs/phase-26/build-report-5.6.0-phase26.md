# Build Report — 5.6.0-phase26

## Release

- Version: `5.6.0-phase26`
- Channel: release candidate
- Target: static GitHub Pages + installable PWA
- Backend: none
- Required native host: none

## Implemented

- Compare 3.0 hybrid page-sequence alignment using extracted text plus low-resolution perceptual visual fingerprints for scan-heavy/image-only pages;
- Create PDF Studio 2.0 inline Markdown/semantic-HTML fidelity for bold, italic, bold-italic, inline code, and safe `http`/`https`/`mailto` links;
- searchable creator output with PDF link annotations plus an explicit non-interactive-link boundary for visual compatibility output;
- Batch 3.0 recipe schema v3 with deterministic v2 migration;
- terminal fixed-page PDF split and page-image export recipe nodes producing local ZIP artifacts;
- Phase 26 runtime/unit/E2E/source-audit/CI/Pages/tagged-release integration.

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
- Phase 26 runtime regression: **12/12**
- Offline TypeScript semantic check: **PASS**
- Production source audit: **190 source files / 566 relative imports resolved**
- GitHub Pages/PWA readiness: **24 pass / 1 expected lockfile warning / 0 failures**
- TS/TSX syntax parser sweep (`src`, `tests`, `scripts`): **236/236**
- GitHub Actions YAML parse: **4/4**
- Production placeholder scan: **0**

## Historical migration regression

Batch recipe schema is now v3. The historical Phase 18 runtime assertion was updated from expecting schema v2 to expecting the current migration target v3. This is a test expectation migration only: legacy recipe inputs still migrate through the existing compatibility path and the complete Phase 16–26 runtime chain passes in one clean run.

## Official dependency gate

Exact `package-lock.json` generation was attempted without changing dependency versions. The configured execution-environment npm registry returned HTTP 404 for pinned `@playwright/test@1.62.0`. A direct lookup against `https://registry.npmjs.org` then failed with `EAI_AGAIN` DNS resolution in this runtime. No lockfile was fabricated and no dependency version was substituted.

The GitHub-hosted **Bootstrap dependency lock** workflow remains the supported route for generating the exact graph, followed by the official `npm ci`, TypeScript, Vitest, Vite/distribution, Chromium/Firefox/WebKit, phone/tablet, offline-PWA, and deployed Pages smoke gates.

## Stable-label boundary

This source archive is a Phase 26 release candidate. Promote it to stable only after the exact GitHub-generated lockfile is committed and the complete lockfile-derived release matrix passes.

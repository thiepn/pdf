# Phase 18 build and validation report

Date: 2026-08-08
Version: `4.2.0-phase18`
Channel: `release-candidate`

## Implemented release scope

Phase 18 adds an integrated Toolbox workspace, local structural/decorative PDF transforms, text/Markdown/HTML/page-image exports, fixed-page splitting, grayscale derivation, and Batch 2.0 ordered recipes. All derived PDF transforms continue through the Phase 16 revision/transaction path rather than replacing the source project.

Batch 2.0 snapshots its recipe at run start, locks edits through pause/resume, normalizes bounded settings, migrates legacy recipes to schema 2, and can package completed results into a local stored ZIP.

## Validation executed in this environment

- Phase 11 dependency-independent runtime regression: **15/15**.
- Phase 11 external-reader corpus: **11/11** generated PDFs validated by PyMuPDF and pypdf.
- Phase 16 runtime regression: **4/4**.
- Phase 17 runtime regression: **10/10**.
- Phase 18 runtime regression: **23/23**.
- Offline semantic TypeScript check: **pass**.
- Source audit: **159 source files**, **476 relative imports resolved**, no production TODO/FIXME/fake-control markers.
- TypeScript/TSX parser-transpile sweep: executed separately across the repository source/test tree.
- Stored ZIP interoperability: independently opened and integrity-checked with Python `zipfile`, including UTF-8 entry names.

## Stable-release blocker

The repository intentionally remains `release-candidate`. The configured npm registry returned `404` for the pinned `@playwright/test@1.62.0`; a reduced temporary installation also returned `404` for the pinned `@types/react@19.2.17`. Therefore a genuine install-derived `package-lock.json`, Vite production build, Vitest execution, and Playwright Chromium/Firefox/WebKit matrix cannot be truthfully claimed from this environment.

The dependency-independent gates do not substitute for that stable-release matrix.

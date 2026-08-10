# Phase 11 Build Audit — 2.0.0-rc.4

## Scope

Audit of the stable-release conversion implementation: dependency policy, package-version correction, offline semantic checking, runtime regression, deterministic PDF corpus, independent-reader validation, browser corpus tests, CI/deployment/release workflows, documentation, and packaging.

## Executed checks

- Dependency policy: passed
- Source and privacy-policy audit: passed with one expected lockfile warning
- Internal semantic/null-safety check: passed
- Pure runtime regression: passed
- Corpus generation: 11 fixtures
- Corpus checksums: passed
- PyMuPDF validation: passed
- pypdf validation: passed
- Permanent-redaction text and metadata absence: passed
- AES-256 authentication fixture: passed
- Malformed fixture rejection: passed
- 200-page terminal-marker validation: passed
- JSON and workflow YAML parsing: passed
- Service-worker JavaScript syntax: passed
- Relative import resolution: passed
- ZIP and TAR archive integrity: passed

## Defects corrected

1. `@playwright/test` was pinned to unpublished version 1.62.1. It is now pinned to published stable 1.62.0.
2. The Node engine range was too broad for Vite 8. It now requires Node 22.12.0 or later.
3. Release workflows did not require deterministic external-reader evidence.
4. Stable tags did not require a committed npm lockfile.
5. Browser regression did not exercise ordinary, encrypted, and large generated corpus files.
6. Restricted environments had no executable semantic/runtime fallback gate.

## Remaining blocked checks

The current environment cannot install the official npm dependency graph. Therefore the following have not been represented as passing:

- Official dependency installation
- Official semantic TypeScript check
- Vitest
- Vite production build
- MuPDF/Tesseract browser execution
- Chromium/Firefox/WebKit Playwright matrix
- Deployed GitHub Pages validation
- Adobe Reader/PDF24/mobile/print matrix

## Decision

Phase 11 implementation is complete. The source remains `2.0.0-rc.4`; changing the version to stable would be unsupported until the remaining gates pass.

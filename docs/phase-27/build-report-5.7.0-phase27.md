# Build Report — 5.7.0-phase27

## Scope

Phase 27 freezes product features and hardens the release toolchain. It does not claim a local stable build without the exact dependency graph.

## Implemented qualification controls

- exact npm lockfile v3/root-pin/integrity audit;
- pinned npm 10.9.2 toolchain audit and `.nvmrc` Node 22.16.0 qualification target;
- clean-install dependency-tree audit;
- deterministic commit-derived build timestamp;
- deterministic generated offline/integrity manifest timestamps;
- same-commit double-build distribution fingerprint comparison in CI, Pages deployment, and tagged release;
- verified-dist artifact upload/download between CI build and browser jobs;
- Playwright preview mode that skips rebuilding and tests the exact verified distribution;
- browser-qualified Pages deployment;
- high-severity npm dependency audit;
- synchronized Phase 27 lock bootstrap, CI, deployment, and tagged-release workflows.

## Dependency-independent validation

- Phase 11 runtime: **15/15**
- External-reader corpus: **11/11 PDFs**
- Phase 16: **4/4**
- Phase 17: **10/10**
- Phase 18: **23/23**
- Phase 19: **21/21**
- Phase 20: **20/20**
- Phase 21: **19/19**
- Phase 22: **6/6**
- Phase 23: **8/8**
- Phase 24: **12/12**
- Phase 25: **12/12**
- Phase 26: **12/12**
- Phase 27: **17/17**
- GitHub Pages/PWA readiness: **27 pass / 0 fail / 1 expected lock warning**
- Production source audit: **190 source files / 566 relative imports / 0 failures / 1 expected lock warning**
- TS/TSX parser sweep: **236/236**
- GitHub Actions YAML: **4/4**

## Exact npm gate

`npm install --package-lock-only` was attempted in the source-preparation environment and failed because that environment's configured npm mirror returned `404` for the current pinned `@playwright/test@1.62.0`. No lockfile was produced or fabricated.

The exact package versions are intentionally unchanged. The GitHub `Bootstrap dependency lock` workflow is the authoritative path: it pins Node 22.16.0/npm 10.9.2, generates the npm v3 lock, audits exact root resolution/integrity, performs a clean install, validates the installed tree, and opens a review PR.

## Promotion rule

This archive remains a release candidate. Promote only after the committed lockfile-derived GitHub jobs pass TypeScript, Vitest, Vite/distribution audit, same-commit reproducibility, Chromium, Firefox, WebKit, phone Chromium, tablet WebKit, dependency security, Pages deployment, live smoke checks, and the external-reader corpus.

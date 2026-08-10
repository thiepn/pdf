# Build Report — 5.2.0-phase22

## Scope

Phase 22 qualifies the existing browser application for static GitHub Pages deployment. No server, native desktop host, or cloud document-processing backend is introduced.

## Dependency-independent validation completed in this environment

- Phase 11 runtime regression: **15/15**
- External-reader PDF corpus: **11/11**
- Phase 16 runtime regression: **4/4**
- Phase 17 runtime regression: **10/10**
- Phase 18 runtime regression: **23/23**
- Phase 19 runtime regression: **21/21**
- Phase 20 runtime regression: **20/20**
- Phase 21 runtime regression: **19/19**
- Phase 22 runtime regression: **6/6**
- GitHub Pages readiness audit: **18 passing checks**, **1 expected warning**, **0 failures**
- Source audit: **171 source files / 520 internal relative imports**, no production placeholders, one expected missing-lock warning
- TS/TSX transpile/parser sweep: **207 implementation/test files**
- GitHub Actions workflow YAML parse: **4/4**

## GitHub Pages release hardening

- Repository-subpath-aware Vite build configuration.
- Repository-relative PWA manifest, install icons, service worker, OCR assets, and offline shell behavior.
- Deployment-scoped cache/service-worker maintenance to avoid deleting unrelated same-origin application caches.
- Playwright browser tests configured to run under the same repository subpath used by a normal GitHub Pages project site.
- Deterministic `npm ci`-only CI/deployment/release workflows.
- First-time **Bootstrap dependency lock** workflow that creates the exact lockfile on GitHub, verifies it with `npm ci`, and opens a review PR.
- Post-deployment smoke checks for the application shell, manifest, worker version, integrity record, and install icons.

## Remaining stable-label gate

This execution environment could not generate the official npm lockfile: its configured mirror returned `404` for the pinned Playwright dependency, while a direct public-registry attempt did not complete. No package versions were changed and no synthetic lockfile was produced.

The source is therefore a **stable-web release candidate**. Promotion to stable is intentionally gated on GitHub by:

1. generating and committing `package-lock.json` through the supplied bootstrap workflow;
2. passing clean `npm ci` from that lock;
3. passing official TypeScript, Vitest, and Vite production-build gates;
4. passing Chromium, Firefox, and WebKit Playwright under the Pages repository base;
5. passing the deployed GitHub Pages smoke job.

# Phase 27 — Real Build & CI Qualification

## Goal

Freeze feature development and make the GitHub-hosted toolchain itself a release gate. Phase 27 does not add PDF functionality. It qualifies the exact dependency graph, production artifact, browser matrix, and GitHub Pages deployment path that later stabilization phases will audit.

## Requirements

1. A committed npm lockfile is mandatory for qualification; no install fallback is permitted.
2. The lockfile root graph must exactly match every pinned dependency in `package.json` and include registry integrity metadata.
3. CI uses the pinned npm version and a supported Node 22 runtime.
4. TypeScript, Vitest, production Vite build, distribution audit, dependency-tree validation, and security audit run from `npm ci`.
5. The verified `dist` artifact is uploaded once and the browser matrix tests that exact artifact rather than rebuilding it inside Playwright.
6. Chromium, Firefox, WebKit, phone Chromium, and tablet WebKit all remain in the browser matrix.
7. GitHub Pages deployment runs browser qualification before uploading the Pages artifact.
8. Build timestamps are derived from the commit timestamp and generated manifests use the same deterministic value.
9. CI builds the same commit twice and compares full distribution fingerprints.
10. The source archive remains a release candidate until GitHub-hosted lockfile-derived qualification is green.

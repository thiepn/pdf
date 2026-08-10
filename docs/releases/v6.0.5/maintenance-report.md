# v6.0.5 Bug Fix Audit 3 — Maintenance Report

v6.0.5 is a maintenance-only release on the frozen 6.0.x line.

## Confirmed defects fixed

- **File Handling dequeue-before-commit:** installed-PWA launch files could be consumed from the transient queue before project import actually succeeded. Launch files are now staged in the local Share Inbox where available and acknowledged only after a successful import or explicit user discard.
- **Partial file-launch batch staging:** a later Cache Storage failure could leave earlier files from the same OS launch staged. The staging helper now rolls back the whole current batch on failure.
- **Destructive Maintenance cache clearing:** clearing application caches could delete pending Share Inbox document bytes and leave the active offline shell absent until a later reload/network fetch. Maintenance now asks the active service worker to refresh the current complete release in place, preserves pending shared files, and retains the previous shell if refresh fails.
- **Cache-repair RPC timeout:** the generic 4-second service-worker RPC timeout was too short for a complete release refresh containing workers/WASM/Tesseract assets. Full-shell refresh now has a dedicated 120-second timeout while status calls remain short.
- **Future project-manifest package restore:** a supported `.lpsproject` container could carry a project manifest from a newer schema. Package decode now enforces the current project-manifest upper bound before reconstruction.
- **Future workspace-state downgrade:** workspace-session normalization could rewrite a newer schema into the current schema. Future workspace state now fails closed and remains untouched.
- **Candidate deployment regression gap:** the ordinary GitHub Pages deployment sequence accidentally omitted the v6.0.1 maintenance runtime gate. The full v6.0.1–v6.0.5 maintenance sequence is restored.

## Compatibility

No format bump: project package v9 (imports v1–v9), project schema v3, database schema v13, settings schema v5, Batch schema v3.

## Qualification evidence

The dependency-independent v6.0.5 maintenance regression, historical Phase 16–30 guarantees, v6.0.1–v6.0.4 maintenance suites, migration/security audits, original external-reader corpus, and Phase 28 adversarial corpus are required to remain green. The source/Pages audits additionally enforce the new launch durability, offline-shell repair, future-schema, and deployment-chain guarantees.

## Stable boundary

Stable promotion still requires the committed exact npm lockfile and GitHub-hosted clean `npm ci`, Vitest/Vite, reproducibility, Playwright desktop/phone/tablet, security, Pages deployment, and live PWA smoke gates. No dependency is substituted and no lockfile is fabricated when the execution environment cannot resolve the pinned graph.

## Final local validation evidence

- Phase 11 runtime: 15/15; original external-reader corpus: 11/11.
- Historical Phase 16–30 runtime guarantees: pass.
- v6.0.1: 18/18; v6.0.2: 17/17; v6.0.3: 13/13; v6.0.4: 16/16; v6.0.5 BF3: 15/15.
- Phase 28 adversarial corpus: 56/56.
- Phase 30 migration audit: 10/10; security/privacy audit: 8/8.
- Source audit: 196 production files / 589 relative imports / 0 failures.
- GitHub Pages/PWA readiness: 34 pass / 0 fail, with the expected missing-lock warning only.
- Offline internal semantic TypeScript check: pass; TS/TSX parser sweep: 253/253.
- GitHub Actions YAML: 4/4; README local links: 80/80.

The exact npm lock could not be generated in this execution environment: the configured mirror returns `404` for pinned `@playwright/test@1.62.0`, while the direct public-registry attempt did not complete. No partial or fabricated lockfile is retained.

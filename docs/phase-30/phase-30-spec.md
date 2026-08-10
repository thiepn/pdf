# Phase 30 Specification — v6.0.0 Release Freeze & Final Qualification

## Goal

Freeze Local PDF Studio at `6.0.0` and make the release state mechanically honest. The same browser-first, GitHub Pages compatible source defaults to `release-candidate`; only the exact `v6.0.0` tagged qualification workflow may build the `stable` channel after every hard release gate passes.

## Release invariants

1. **No feature work** — only bug fixes, migration, security/privacy, release engineering, documentation, accessibility, compatibility, and performance corrections.
2. **One frozen source** — release-candidate and stable builds differ only through verified release metadata, never through a separate code branch.
3. **Stable is earned** — `VITE_RELEASE_CHANNEL=stable` is accepted only by the exact tagged GitHub release workflow.
4. **Exact dependency graph** — stable requires a committed npm v3 lockfile and `npm ci`; no install fallback or substituted dependency version is allowed.
5. **Exact artifact qualification** — browser tests run against the same verified `dist` that is deployed.
6. **Reproducibility** — two builds of the same commit must have matching distribution fingerprints.
7. **Migration safety** — project package formats v1–v9 and persisted state migrations remain readable where historically supported.
8. **Privacy boundary** — PDFs, passwords, project content, and support-bundle document content remain local unless the user explicitly exports/shares them.
9. **Static deployment** — no backend or desktop runtime is required; GitHub Pages/PWA remains the product architecture.

## Workstreams

### 1. Frozen release identity

- Product version: `6.0.0`.
- Default channel: `release-candidate`.
- Stable promotion: exact `v6.0.0` tag only.
- Release metadata is emitted into the production distribution and verified during Pages smoke tests.

### 2. Clean-room qualification

The authoritative GitHub qualification sequence is:

`npm ci` → lock/toolchain/dependency audits → historical PDF/runtime corpora → TypeScript → Vitest → deterministic Vite build → second-build fingerprint comparison → Chromium/Firefox/WebKit + phone/tablet Playwright against the verified artifact → security audit → Pages deployment → live smoke test.

### 3. Migration qualification

Verify the current application retains its declared migration paths for:

- `.lpsproject` package formats v1–v9;
- project manifests;
- settings through schema v5;
- editor/security/native/compliance state;
- Batch recipes through schema v3.

Current v9 packages authenticate both binary payload bytes and canonical package metadata.

### 4. Security/privacy qualification

Audit:

- CSP and referrer policy;
- explicit network destinations;
- password persistence sinks;
- support-bundle privacy defaults;
- project-package password stripping;
- runtime external-resource behavior.

### 5. Final tagged release

The tagged workflow must deploy and smoke-test the stable artifact before publishing the GitHub Release. A failed deploy or smoke test must leave no published stable release.

## Non-goals

- No new PDF tools.
- No UI redesign.
- No desktop/Tauri conversion.
- No backend services.
- No fake lockfile, browser result, accessibility certification, PDF/A certification, or stable label.

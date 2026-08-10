# Phase 30 Final Qualification Report

## Frozen candidate

- **Version:** `6.0.0`
- **Default channel:** `release-candidate`
- **Architecture:** static browser/PWA, GitHub Pages compatible, local-first
- **Feature state:** frozen

## Dependency-independent evidence

At Phase 30 release freeze, the following gates are green in the available environment:

- Phase 11 runtime: **15/15**.
- Original external-reader corpus: **11/11 PDFs**.
- Historical Phase 16–30 runtime suites: **all passing**.
- Phase 28 adversarial corpus: **56/56 PDFs**.
- Phase 30 release-freeze runtime: **12/12**.
- Phase 30 migration audit: **10/10**.
- Phase 30 security/privacy audit: **8/8**.
- Offline TypeScript semantic gate: **PASS**.
- Production source audit: **PASS**.
- GitHub Pages/PWA readiness: **29 pass / 0 fail / 1 expected missing-lock warning**.
- Full implementation + unit/E2E TypeScript semantic sweep: **243/243 PASS**.
- GitHub Actions YAML parse: **4/4 PASS**.
- README local-link audit: **75/75 PASS**.

## Stable promotion workflow

Stable promotion is intentionally not a source-code toggle. The exact `v6.0.0` tag workflow must:

1. verify the tag and committed lockfile;
2. run clean `npm ci` on the pinned Node/npm toolchain;
3. run the historical runtime/corpus/security/migration gates;
4. run TypeScript and Vitest;
5. build and audit the production distribution;
6. rebuild the same commit and compare complete distribution fingerprints;
7. run Chromium, Firefox, WebKit, phone Chromium, and tablet WebKit against the verified artifact;
8. run npm security auditing;
9. deploy that exact artifact to GitHub Pages;
10. smoke-test the live service worker, offline manifest, integrity metadata, and `release-metadata.json` stable channel;
11. publish the GitHub Release only after the live smoke job succeeds.

## Current blocker

This execution environment cannot obtain the authoritative npm dependency graph. Its configured npm registry returns `404` for pinned `@playwright/test@1.62.0`; the direct public npm check fails with `EAI_AGAIN` DNS resolution. No partial lockfile was retained. No dependency substitution or fabricated lockfile is permitted.

Therefore the current archive is the **frozen v6.0.0 release candidate**, ready for the GitHub-hosted final qualification. It must not be described as Stable until that workflow passes.

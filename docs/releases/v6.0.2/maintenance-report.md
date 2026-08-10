# v6.0.2 Maintenance Qualification Report

## Scope

`6.0.2` is a maintenance-only patch on the frozen `6.0.x` feature line. It adds no new PDF editing capability and does not change `.lpsproject` format v9, project schema v3, database schema v13, or settings schema v5.

## Correctness fixes

1. **Stable-channel monotonicity.** Same-version release-candidate service workers cannot replace a Stable cache, and ordinary Pages deployment refuses to publish a candidate after the Stable tag for that version exists.
2. **Atomic production PWA installation.** A stamped production worker must obtain a non-empty `offline-assets.json`; otherwise installation rejects and its partial release cache is deleted.
3. **Truthful healthy-client acknowledgement.** Old release caches are cleaned only after React has committed successfully and the active worker reports a complete offline bundle. Safe Mode suppresses both service-worker registration and this acknowledgement.
4. **Project-package structure validation.** Required asset ranges, required manifest strings, and array-shaped package collections are validated before imported state is reconstructed.
5. **Stable source provenance.** The Stable tag must match the current `main` HEAD before the tagged publication workflow proceeds.
6. **Maintenance-version synchronization.** The active Release UI derives its version from runtime release metadata, and the frozen Phase 30 unit assertion accepts later 6.0.x patch releases.

## Compatibility

The patch does not change document semantics or persistent schema versions. Project packages v1–v9 remain accepted subject to the validation guarantees of their original format versions.

## Release boundary

Source builds remain `release-candidate`. The exact `v6.0.2` GitHub tag is the only Stable-channel path. Stable publication still requires the committed exact npm lock, clean `npm ci`, all historical and maintenance regressions, Vitest/Vite, reproducible distribution fingerprints, the desktop + phone/tablet Playwright matrix against the exact built artifact, security/dependency audits, GitHub Pages deployment, and live PWA smoke verification.

## Packaged-source validation

- Phase 11 runtime **15/15**; external-reader corpus **11/11**.
- Phase 16–30 historical runtime suites: **all pass**.
- v6.0.1 maintenance regression **18/18**.
- v6.0.2 maintenance regression **17/17**.
- Phase 28 adversarial PDF corpus **56/56**.
- Phase 30 migration audit **10/10** and security/privacy audit **8/8**.
- GitHub Pages/PWA readiness **34 pass / 0 fail** plus the expected missing-lock warning.
- Source audit **195 files / 580 imports / 0 failures**.
- Source + test TypeScript semantic sweep **248 files**.
- GitHub workflow YAML **4/4**; README local links **77/77**.

The configured execution-environment npm mirror still returns `404` for exact `@playwright/test@1.62.0`; a direct public-registry lock attempt did not complete in this runtime. No lockfile or dependency substitution is fabricated.

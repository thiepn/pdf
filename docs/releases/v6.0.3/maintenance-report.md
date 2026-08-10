# Local PDF Studio v6.0.3 Maintenance Qualification

**Scope:** bug fixes only on the frozen 6.0.x feature line.

## Fixed defects

1. Shared PWA files were removed from the local inbox before project creation succeeded. v6.0.3 removes them only after a successful import; password-gated and failed imports remain recoverable.
2. Multi-file Web Share Target writes could leave a partial inbox if a later Cache Storage write failed. The share batch now rolls back previously inserted entries on failure.
3. Safe Mode suppressed service-worker registration/health acknowledgement but still listened for `controllerchange`, allowing another tab to force a reload. Safe Mode now suppresses that listener too.
4. Project-package import could silently misbind/drop editor/OCR state when asset/job IDs were duplicated or references were missing. Semantic references are now validated before project creation.
5. Stable release provenance required the tag commit to equal the mutable current `main` HEAD. The workflow now requires the tag commit to be an ancestor of `main`, preventing branch-advance races while still rejecting off-main release tags.

## Compatibility

- Project package format: v9 unchanged.
- Imports supported: v1–v9 unchanged.
- Project schema: v3 unchanged.
- Database schema: v13 unchanged.
- Settings schema: v5 unchanged.

## Stable boundary

Source builds remain `release-candidate`. Stable promotion is restricted to the exact `v6.0.3` tag after committed-lock clean install, full regression/corpora, reproducible Vite build, exact-artifact Playwright matrix, security audits, GitHub Pages deployment, and live PWA smoke verification pass.

## Local qualification evidence

- Phase 11 runtime: 15/15; original external-reader corpus: 11/11.
- Historical Phase 16–30 runtime regressions: all pass.
- v6.0.1: 18/18; v6.0.2: 17/17; v6.0.3: 13/13.
- Phase 28 adversarial corpus: 56/56 PDFs.
- Phase 30 migration audit: 10/10; security/privacy audit: 8/8.
- GitHub Pages/PWA readiness: 34 pass / 0 fail with the expected missing-lock warning.
- Source audit: 195 production TS/TSX files / 580 internal imports / 0 failures.
- TS/TSX parser sweep: 249/249 source+test files.
- GitHub Actions YAML: 4/4.

The exact lockfile-derived npm/Vitest/Vite/Playwright qualification remains pending because this execution environment's configured npm mirror returns 404 for the pinned Playwright package. No dependency substitution or fabricated lockfile is retained.

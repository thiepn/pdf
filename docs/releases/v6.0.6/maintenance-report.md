# v6.0.6 Bug Fix Audit 4 — Maintenance Report

v6.0.6 is a maintenance-only release on the frozen 6.0.x line.

## Confirmed defects fixed

- **Future settings downgrade:** an older build could read a newer settings schema as defaults and later overwrite the newer record. Future settings are now detected, preserved untouched, and writes fail closed with an update-required error.
- **Future Batch recipe downgrade:** Batch migration treated unknown future schemas as legacy input. Recipe schema versions above the current v3 boundary are now rejected before migration.
- **Future OCR job downgrade:** locally persisted OCR jobs did not enforce an upper schema bound. Read/list/write paths now reject future OCR job schemas rather than rewriting them.
- **Share Inbox duplicate-after-cleanup-failure:** a successful project import could be re-presented after reload if physical Cache Storage deletion failed. Successful imports now record a durable consumed acknowledgement first; listing suppresses acknowledged entries and retries physical cleanup later.
- **Project deletion orphaned private bytes:** a project manifest could be removed even if deletion of its authoritative PDF source failed, leaving unreachable local document bytes. Source deletion now occurs first; on failure the manifest remains so the user can retry deletion safely.
- **Service-worker activation race:** `registration.waiting` could become null after `SKIP_WAITING` was sent but before the helper returned, causing a successful activation request to be reported as failure. The waiting worker is now captured before the transition and success is reported deterministically.

## Compatibility

No format bump: project package v9 (imports v1–v9), project schema v3, database schema v13, settings schema v5, Batch schema v3.

## Qualification evidence

The dependency-independent v6.0.6 maintenance regression, historical Phase 16–30 guarantees, v6.0.1–v6.0.5 maintenance suites, migration/security audits, original external-reader corpus, and Phase 28 adversarial corpus are required to remain green. Source/Pages audits additionally enforce the new future-schema, Share Inbox, deletion-order, activation-race, and maintenance-chain guarantees.

## Stable boundary

Stable promotion still requires the committed exact npm lockfile and GitHub-hosted clean `npm ci`, Vitest/Vite, reproducibility, Playwright desktop/phone/tablet, security, Pages deployment, and live PWA smoke gates. No dependency is substituted and no lockfile is fabricated when the execution environment cannot resolve the pinned graph.

## Final local validation evidence

- Phase 11 runtime: 15/15; original external-reader corpus: 11/11.
- Historical Phase 16–30 runtime guarantees: pass.
- v6.0.1: 18/18; v6.0.2: 17/17; v6.0.3: 13/13; v6.0.4: 16/16; v6.0.5: 15/15; v6.0.6 BF4: 13/13.
- Phase 28 adversarial corpus: 56/56.
- Phase 30 migration audit: 10/10; security/privacy audit: 8/8.
- Source audit: 196 production files / 590 relative imports / 0 failures.
- GitHub Pages/PWA readiness: 34 pass / 0 fail, with the expected missing-lock warning only.
- Offline internal semantic TypeScript check: pass.

The exact npm lock remains an external qualification boundary in this execution environment because the configured registry does not provide the pinned Playwright package. No partial or fabricated lockfile is retained.

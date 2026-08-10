# v6.0.1 Maintenance Qualification Report

## Scope

`6.0.1` is the first maintenance release on the frozen `6.0.x` feature line. It introduces no new PDF editing capability and does not change `.lpsproject` format v9, project schema v3, database schema v13, or settings schema v5.

## Reproducible defects fixed

1. **Same-version PWA promotion identity** — a release-candidate and Stable build of the same semantic version could share a byte-identical service-worker script/cache identity, leaving installed clients on the candidate shell. Production builds now stamp version, channel, and deterministic build epoch into the worker and release cache key.
2. **Project-package payload-range validation** — malformed legacy JSON metadata could use coercive, negative, truncated, incomplete, or overlapping payload ranges. The decoder now requires safe integers, validates PDF/asset/OCR bounds before reconstruction, and rejects overlapping slices.
3. **Future project-schema downgrade protection** — an older build could treat a future local project manifest as migratable and rewrite it to the current schema. Future schemas are now refused without modification; older schemas continue to migrate forward.
4. **CI browser qualification ordering** — the non-browser validation job invoked the Phase 30 aggregate, which includes Playwright, before browser binaries were installed. CI now runs the frozen non-browser `release:web` qualification first and leaves Playwright exclusively to the exact-artifact browser job after browser installation.

## Dependency-independent evidence

- v6.0.1 maintenance runtime: **18/18**.
- Phase 24 PWA/update regression: **12/12**.
- Phase 27 release-engineering regression: **17/17**.
- Phase 28 recovery/persistence regression: **11/11**.
- Phase 29 UX/accessibility/performance regression: **20/20**.
- Phase 30 release-freeze regression: **12/12**.
- Phase 30 migration audit: **10/10**.
- Phase 30 security/privacy audit: **8/8**.
- Phase 11 dependency-independent stability gate: **PASS**.
- Original external-reader corpus: **11/11 PDFs**.
- Phase 28 adversarial corpus: **56/56 PDFs**.
- Offline TypeScript semantic gate for production source: **PASS**.
- Production + unit/E2E TypeScript semantic sweep with offline declarations: **PASS**.
- Source audit: **194 production source files / 578 relative imports / 0 failures**.
- GitHub Pages/PWA readiness: **30 pass / 0 fail / 1 expected missing-lock warning**.

## Stable promotion boundary

The source archive defaults to the `release-candidate` channel. The exact `v6.0.1` GitHub tag is the only workflow allowed to emit `VITE_RELEASE_CHANNEL=stable`. That workflow must use the committed npm lockfile, run clean `npm ci`, the full release gate, reproducible-build fingerprinting, Vitest, Chromium/Firefox/WebKit plus phone/tablet Playwright against the exact verified `dist`, deploy that artifact to GitHub Pages, and pass live PWA smoke checks before publishing the GitHub Release.

The current execution environment cannot produce the authoritative lockfile because its npm mirror does not serve the pinned Playwright package and direct public-registry access is unavailable. No dependency was substituted and no lockfile was fabricated.

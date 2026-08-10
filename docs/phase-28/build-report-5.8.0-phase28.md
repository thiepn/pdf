# Build Report — 5.8.0-phase28

## Dependency-independent qualification completed

- Offline internal semantic check: PASS
- Source audit: PASS — 191 production source files, 570 resolved relative imports, 0 failures
- GitHub Pages/PWA readiness: PASS — 27 passed, 0 failed, 1 expected dependency-lock warning
- Phase 11 runtime: 15/15
- Phase 11 external-reader corpus: 11/11
- Phase 16: 4/4
- Phase 17: 10/10
- Phase 18: 23/23
- Phase 19: 21/21
- Phase 20: 20/20
- Phase 21: 19/19
- Phase 22: 6/6
- Phase 23: 8/8
- Phase 24: 12/12
- Phase 25: 12/12
- Phase 26: 12/12
- Phase 27: 17/17
- Phase 28: 11/11
- Phase 28 adversarial corpus: 56/56
- TS/TSX parser sweep: 240/240
- GitHub Actions YAML parse: 4/4

## Important Phase 28 fixes

- Existing projects are preserved when checksum-dedup source reads fail.
- Recovery heartbeats are isolated per browser workspace session.
- Interrupted transactions reconcile derived outputs one-to-one.
- OPFS failures abort writable streams and IndexedDB aborts reject callers.
- `.lpsproject` format v9 authenticates both payload and metadata/header mappings.
- Backup export validates the stored source PDF against the project's SHA-256 before packaging.

## Stable-release gate still pending

This execution environment does not contain the authoritative `package-lock.json` and has previously been unable to resolve the exact npm graph. Therefore the following are **not** claimed locally:

- `npm ci` from committed lockfile
- official Vitest execution
- Vite production build from the exact lock
- Chromium/Firefox/WebKit + phone/tablet Playwright matrix against the verified `dist`
- deployed GitHub Pages smoke qualification

The GitHub Phase 27/28 workflows remain the authoritative path for these gates. No dependency versions are substituted and no lockfile is fabricated.

# v6.0.4 Bug Fix Audit 2 — Maintenance Report

v6.0.4 is a maintenance-only release on the frozen 6.0.x line.

## Confirmed defects fixed

- **Committed share import misreported as failed:** a Cache Storage cleanup error after successful project creation could enter the import failure path and cause a duplicate retry. Cleanup is now best-effort after commit.
- **Future project touched by dedupe:** raw checksum matching could reuse/update a future-schema manifest before the project-schema guard ran. Dedupe now considers only supported manifests and migrates legacy manifests before reuse.
- **Feature-state downgrade risk:** editor/security/native/compliance readers treated any non-current schema as migratable. Future schemas now fail closed and remain untouched.
- **Package embedded-state compatibility:** restored packages now enforce current upper schema bounds for editor/security/native/compliance/OCR state and reject duplicate editor object IDs.
- **Shallow Stable ancestry false rejection:** Stable release qualification now checks ancestry from a full-history checkout.

## Compatibility

No format bump: project package v9, project schema v3, database schema v13, settings schema v5.

## Stable boundary

Stable promotion still requires a committed exact npm lockfile and the GitHub-hosted clean install, Vitest/Vite, reproducibility, Playwright desktop/phone/tablet, security, Pages deployment, and live PWA smoke gates.

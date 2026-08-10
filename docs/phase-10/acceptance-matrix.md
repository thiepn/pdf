# Phase 10 Acceptance Matrix

| Capability | Result | Evidence |
|---|---|---|
| Download metadata receipts | Pass | Shared `downloadBlob` integration, bounded IndexedDB store, source audit |
| SHA-256 output checksum | Pass | Uses canonical browser checksum implementation |
| Receipt opt-out | Pass | Report exports use `{ track: false }` |
| Receipt privacy control | Pass | Settings schema 3 `recordActivity` flag |
| Activity export | Pass | JSON and CSV output with CSV escaping test |
| Safe-mode startup boundary | Pass | Auto-reopen and service-worker registration are gated |
| Project health maintenance | Pass | Existing checksum and reference checks exposed in maintenance workspace |
| Safe issue repair | Pass | Only explicitly repairable metadata/orphan issues are automated |
| Cache recovery | Pass | Same-origin application caches can be cleared; OCR cache is preserved by default |
| Service-worker recovery | Pass | Registrations can be enumerated and unregistered |
| Support-bundle privacy | Pass | Static source boundary excludes document bytes and password fields |
| Offline help center | Pass | Bundled help data and route; no network dependency |
| Command palette | Pass | Ctrl/Cmd + K with route search and Escape dismissal |
| Database migration | Pass | Schema advanced to 8 with `activityReceipts` store |
| Settings migration | Pass | Schema advanced to 3 with v1/v2 migration support |
| Release-validation activity-store test | Pass | Disposable IndexedDB write/read/delete task |
| Official dependency build | Blocked locally | Restricted npm registry lacks required scoped packages |
| Playwright browser matrix | Pending | Required in GitHub Actions before stable publication |
| External PDF compatibility corpus | Pending | Stable-release checklist remains open |

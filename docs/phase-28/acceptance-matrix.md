# Phase 28 Acceptance Matrix

| Gate | Requirement | Result |
|---|---|---|
| Existing project preservation | Transient duplicate-source read failure must not delete existing project | PASS |
| Duplicate integrity | Reuse only after stored source SHA-256 matches manifest | PASS |
| Backup source integrity | Refuse backup if stored source SHA-256 differs from project manifest | PASS |
| Package payload integrity | Modified/truncated payload rejected | PASS |
| Package metadata integrity | v9 header/offset/manifest modification rejected | PASS |
| Legacy package compatibility | v1–v8 imports remain accepted | PASS |
| Multi-tab crash evidence | Heartbeats keyed per workspace session | PASS |
| Interrupted transaction recovery | Derived outputs assigned one-to-one | PASS |
| IndexedDB abort | Write/delete promises reject aborted transactions | PASS |
| OPFS abort | Failed source writes abort the writable stream | PASS |
| Baseline PDF corpus | 11/11 | PASS |
| Adversarial PDF corpus | 56/56 dual-reader + render smoke validation | PASS |
| Phase 16–28 runtime chain | All historical runtime regressions | PASS |
| Offline semantic check | Internal TypeScript semantic gate | PASS |
| Source audit | No failures | PASS |
| GitHub Pages/PWA readiness | 0 failures | PASS |
| Exact npm lock/build/browser gate | Authoritative package-lock + npm ci + Vitest/Vite/Playwright | PENDING — environment registry unavailable |

## Release decision

Phase 28 may ship as a **release candidate**. It must not be promoted to stable until the exact Phase 27 npm/build/browser qualification executes successfully on GitHub.

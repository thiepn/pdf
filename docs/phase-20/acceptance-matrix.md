# Phase 20 Acceptance Matrix

| Capability | Gate | Expected |
|---|---|---|
| Adaptive large-document policy | Phase 20 runtime/unit | PASS |
| Render scheduler concurrency cap | Phase 20 runtime/unit | PASS |
| Queued render cancellation | Phase 20 runtime | PASS |
| Workspace heartbeat clean/unclean semantics | Unit/offline semantic | PASS |
| Settings schema 5 migration | Source/unit | PASS |
| Runtime health collection excludes document contents | Source audit | PASS |
| Desktop bridge version boundary | Offline semantic | PASS |
| Existing Phase 16–19 regressions | Runtime suites | PASS |
| Malformed/encrypted/forms/Unicode/redaction corpus | Phase 11 gate | PASS |
| Official production dependency build | npm/Vite | REQUIRED FOR STABLE |
| Chromium/Firefox/WebKit E2E | Playwright | REQUIRED FOR STABLE |
| Large real-world 500/1000-page manual profile | Browser matrix | REQUIRED FOR FINAL PERFORMANCE SIGN-OFF |

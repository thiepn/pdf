# Phase 21 Acceptance Matrix

| Capability | Gate | Expected |
|---|---|---|
| Same-project coordinated operations cannot overlap | Phase 21 runtime/unit | PASS |
| Different projects can process independently | Phase 21 runtime/unit | PASS |
| Cancellable operation propagates AbortSignal | Phase 21 runtime/unit | PASS |
| Non-cancellable operation rejects global cancel | Phase 21 runtime/unit | PASS |
| Operation subscriber lifecycle returns to idle | Phase 21 runtime/unit | PASS |
| Healthy storage budget is accepted | Phase 21 runtime/unit | PASS |
| Near-reserve storage write is rejected for persistence | Phase 21 runtime/unit/source | PASS |
| Over-quota write is rejected | Phase 21 runtime/unit | PASS |
| Unsupported quota API degrades explicitly | Phase 21 runtime/unit | PASS |
| Project source persistence performs storage preflight | Source audit/offline semantic | PASS |
| Derived/recovery workspace entry points coordinate operations | Source audit/offline semantic | PASS |
| Failed project persistence cleans partial storage | Source/offline semantic | PASS |
| Existing Phase 16–20 regressions | Runtime suites | PASS |
| Malformed/encrypted/forms/Unicode/redaction corpus | Phase 11 gate | PASS |
| Official production dependency build | npm/Vite | REQUIRED FOR STABLE |
| Chromium/Firefox/WebKit E2E | Playwright | REQUIRED FOR STABLE |
| Cross-tab Web Locks behavior in real browsers | Browser matrix | REQUIRED FOR STABLE |
| Real quota-pressure behavior across browsers/devices | Browser matrix | REQUIRED FOR STABLE |

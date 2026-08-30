# P36 Acceptance Matrix

| Requirement | Evidence | Status |
| --- | --- | --- |
| Layout-aware text properties do not expose `P2` as product vocabulary | `tests/e2e/p2-layout-reflow.spec.ts`, `tests/e2e/p36-editor-user-language.spec.ts` | Automated |
| Existing-image properties do not expose `P3` | `tests/e2e/p36-editor-user-language.spec.ts` | Automated |
| Existing-vector properties do not expose `P4` | `tests/e2e/p36-editor-user-language.spec.ts` | Automated |
| Structured-table properties do not expose `P5` | `tests/e2e/p36-editor-user-language.spec.ts` | Automated |
| Table primary facts do not show a raw confidence percentage | `tests/e2e/p36-editor-user-language.spec.ts` | Automated |
| Nested-group properties do not expose `P7` | `tests/e2e/p36-editor-user-language.spec.ts` | Automated |
| Internal reconstruction/test identifiers remain available for engineering qualification | Existing P2/P3/P4/P5/P7 test suites and internal class/ID names | Preserved |
| PDF mutation, persistence, schema, and fidelity behavior are unchanged | Source diff limited to native-properties copy/tests/docs | Review |

## Required gate

Before merge, the branch must pass PDF Studio CI including browser regression, Consumer performance budget, and R10 operational-readiness policy.

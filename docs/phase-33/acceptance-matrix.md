# Phase 33 Acceptance Matrix

| ID | Requirement | Evidence / Gate |
| --- | --- | --- |
| P33-SAVE-01 | Editor changes enter `pending` before debounce and `saving` during persistence. | Unit status tests plus browser save-trust regression. |
| P33-SAVE-02 | `saved` is shown only after editor state, native state, and project recovery metadata succeed. | Serialized save implementation and failure-injection E2E. |
| P33-SAVE-03 | Autosave failures are visible and never swallowed. | Failure banner and retry regression. |
| P33-SAVE-04 | Quota/interrupted writes use truthful recovery guidance. | `localSaveTrust` unit tests. |
| P33-SAVE-05 | Failed/current revisions can be retried without losing in-memory edits. | Failure-injection E2E. |
| P33-SAVE-06 | Older save completions cannot mark a newer revision as saved. | Revision guard and serialized queue. |
| P33-SAVE-07 | Browser unload is guarded while persistence is pending, active, or failed. | Unit contract plus source review. |
| P33-SAVE-08 | Internal editor unmount performs a best-effort flush of the latest unresolved snapshot. | Source review and lifecycle regression. |
| P33-ARCH-01 | No storage schema or PDF engine changes are introduced. | Diff review and full repository gates. |
| P33-PRIV-01 | Persistence remains browser-local with no network path. | Existing privacy regression. |

## Merge gate

P33 may merge only after PDF Studio CI, browser regression, consumer performance, and operational-readiness policy succeed on the final branch head. The already-tagged v7.0.0 Stable deployment must not be overwritten by this unreleased main-line work.

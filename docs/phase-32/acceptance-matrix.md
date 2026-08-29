# Phase 32 Acceptance Matrix

| ID | Requirement | Evidence / Gate |
| --- | --- | --- |
| P32-HOME-01 | Home leads with a task-first question rather than PDF implementation terminology. | Browser regression asserts the task-first heading. |
| P32-HOME-02 | Eight common consumer tasks are visible and sourced from the canonical task catalogue. | Home renders canonical task IDs through `getTask()` / `taskRoute()`; browser regression checks card count and key tasks. |
| P32-HOME-03 | `All PDF tools` remains one clear path to complete product breadth. | Browser regression asserts the catalogue link; Tools retains all non-hidden task categories. |
| P32-HOME-04 | Restore project, sample document, and recent-project continuation remain reachable without competing with task selection. | Browser regression verifies continuation actions after the task surface. |
| P32-TRUST-01 | Recovery wording states that browser storage can be cleared. | Browser regression asserts the local-autosave warning. |
| P32-TRUST-02 | Local processing wording remains truthful and no remote upload path is introduced. | Source review plus existing privacy and network regression suites. |
| P32-TOOLS-01 | Full catalogue language is job-oriented and does not require users to understand internal modes. | Tools page copy and canonical task-card labels. |
| P32-TOOLS-02 | Capability states and blocked-task recovery remain authoritative. | Existing capability-gating unit/E2E suites. |
| P32-ROUTE-01 | Exact task routing/focus survives Home and All PDF tools entry points. | Existing task-intent focus and routing suites remain green. |
| P32-EDITOR-01 | No editor tool or keyboard shortcut is removed by the IA simplification. | Existing editor/native E2E suites plus source review. |
| P32-PERF-01 | P31 interaction-critical-path behavior remains unchanged. | `p31-critical-path.spec.ts`, consumer performance budget, and CI. |
| P32-RESP-01 | Home remains usable without horizontal overflow on desktop and qualified mobile widths. | Existing desktop/mobile browser regression plus responsive Home CSS. |
| P32-REL-01 | P32 does not change PDF transformation engines, storage schema, or local-first architecture. | Diff review; full release qualification. |

## Merge gate

P32 may merge only after the repository CI, consumer performance budget, and operational-readiness policy succeed on the final branch head. Automated qualification does not replace the outstanding human R9 usability evidence requirement for stable release certification.

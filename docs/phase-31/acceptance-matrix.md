# Phase 31 Acceptance Matrix

| Gate | Requirement | Qualification |
|---|---|---|
| Input-aware hydration | Non-critical native enrichment waits through continued user activity and resumes automatically after the quiet window | Automated P31 Playwright |
| Added-object drag path | Move/resize preview does not update `EditorPage` preview state on every pointermove | Structural + P31 Playwright |
| Added-object commit | Final move/resize geometry still enters normal history/state on pointerup | Existing editor suites + P31 Playwright |
| Native drag path | Native move/resize preview geometry is not stored in React preview state | Structural |
| Native pointer coalescing | Snapping/clamping and DOM preview are scheduled at most once per animation frame | Structural |
| Native transform commit | Existing-PDF transform is queued only after the interaction completes | Existing P1–P7 editor suites |
| Thumbnail contention | Fallback thumbnail queue has at most two concurrent low-priority renders | Structural |
| Drag responsiveness | Chromium P31 drag fixture retains heartbeat progress and maximum recorded long task `< 500 ms` | Automated P31 Playwright |
| Editor correctness | Selection, snapping, history, autosave, native editing, export, and recovery remain supported | Existing unit/E2E/CI |
| Privacy boundary | Performance work adds no network or remote-processing dependency | Structural + existing privacy suite |

## Completion rule

P31 is complete when the branch passes TypeScript/build/unit qualification, the new P31 critical-path browser tests, the existing editor/native regression suites, and the repository's authoritative CI/performance gates.

P31 does **not** certify the consumer information architecture or workflow simplicity. Those changes belong to P32.

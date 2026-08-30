# P39 Acceptance Matrix

| ID | Requirement | Evidence / gate |
| --- | --- | --- |
| P39-UX-01 | Existing PDF layer rows do not show raw confidence percentages by default. | `p39-layers-progressive-disclosure.spec.ts` |
| P39-UX-02 | Added-object rows do not show numeric z-index/layer order by default. | Browser regression |
| P39-UX-03 | The user-facing heading is `Added objects`, not `Overlay objects`. | Browser regression |
| P39-UX-04 | Queued edit counts and editability labels remain visible in the normal view. | Source review + existing editor regressions |
| P39-UX-05 | One explicit control reveals and re-hides technical metadata. | Browser regression |
| P39-A11Y-01 | The disclosure control exposes its state with `aria-pressed`. | Browser regression |
| P39-SAFE-01 | No object discovery, scoring, geometry, ordering, persistence, edit-routing, or export behavior changes. | Diff review + full CI |
| P39-PERF-01 | Consumer performance budget remains green. | Consumer performance workflow |
| P39-OPS-01 | Operational-readiness policy remains green. | R10 workflow |

## Merge gate

Merge only when PDF Studio CI, including browser regression, Consumer performance budget, and R10 operational-readiness all succeed on the final branch head.
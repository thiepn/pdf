# P38 Acceptance Matrix

| ID | Requirement | Evidence / gate |
| --- | --- | --- |
| P38-UX-01 | Mixed-selection badge shows only the selection count, with no reconstruction phase label. | `p38-editor-command-language.spec.ts` |
| P38-UX-02 | Duplicate command explains why existing PDF objects are not duplicated without P1–P8 vocabulary. | Browser regression |
| P38-UX-03 | Copy command explains why existing PDF objects are not cloned independently without P1–P8 vocabulary. | Browser regression |
| P38-UX-04 | Painting-order warning explains the actual existing-content restriction in user language. | Source review |
| P38-ARCH-01 | Internal P6 engineering selectors/tests may remain; behavior is unchanged. | Diff review + existing P6 regressions |
| P38-SAFE-01 | No geometry, clipboard payload, ordering, persistence, or export code path changes. | Diff review + full CI |
| P38-PERF-01 | Consumer performance budget remains green. | Consumer performance workflow |
| P38-OPS-01 | Operational-readiness policy remains green. | R10 workflow |

## Merge gate

Merge only when PDF Studio CI, including browser regression, Consumer performance budget, and R10 operational-readiness all succeed on the final branch head.

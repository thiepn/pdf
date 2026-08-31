# P42 Acceptance Matrix

| ID | Requirement | Evidence |
| --- | --- | --- |
| P42-UX-01 | Global Tools shows everyday tasks by default. | unit + browser regression |
| P42-UX-02 | Global advanced/specialist tasks are behind one explicit disclosure. | browser regression |
| P42-UX-03 | Current-document Tools shows everyday tasks by default. | unit + browser regression |
| P42-UX-04 | Current-document advanced/specialist tasks are behind one explicit disclosure. | browser regression |
| P42-UX-05 | Search can surface advanced tasks without opening the disclosure first. | browser regression |
| P42-UX-06 | Search can surface recovery tasks such as Repair. | browser regression |
| P42-UX-07 | Batch automation is not exposed as an everyday related workflow for the current PDF. | unit + browser regression |
| P42-A11Y-01 | Advanced groups use native `details` / `summary` disclosure semantics and remain keyboard operable. | source review + browser regression |
| P42-SAFE-01 | Task IDs, routes, capability checks, processing, persistence, and output behavior are unchanged. | diff review + full CI |
| P42-PERF-01 | Consumer performance budget remains green. | performance workflow |
| P42-OPS-01 | R10 operational readiness remains green. | R10 workflow |

## Merge gate

Merge only after PDF Studio CI (including exact-distribution browser/privacy regression), Consumer performance budget, and R10 operational readiness pass on the final P42 head.

# P40 Acceptance Matrix

| ID | Requirement | Evidence / gate |
| --- | --- | --- |
| P40-UX-01 | Startup/readiness surfaces do not expose PDF-engine or Unified-editor language. | `p40-editor-secondary-language.spec.ts` |
| P40-UX-02 | Header/subtitle counts describe PDF items and added objects without overlay/editor-object terminology. | Browser regression |
| P40-UX-03 | Existing-PDF edit readiness uses plain `PDF edit(s) ready` language rather than queue terminology. | Source audit + browser regression |
| P40-UX-04 | Export progress/result copy uses Prepare / Check / Save / Download language rather than compile/validate/revision vocabulary. | Source audit + export browser regression |
| P40-UX-05 | Local-save labels use consistent `saved locally` language. | `localSaveTrust.test.ts` + browser regression |
| P40-UX-06 | Empty-state, warning-banner, paste-image, image-read, undo/redo, and protected-PDF secondary copy is plain user language. | Source audit |
| P40-SAFE-01 | No inspection, editing, persistence, password, export-byte, validation-rule, or project-lineage behavior changes. | Diff review + full CI |
| P40-PERF-01 | Consumer performance budget remains green. | Consumer performance workflow |
| P40-OPS-01 | Operational-readiness policy remains green. | R10 workflow |

## Merge gate

Merge only when PDF Studio CI, including browser regression, Consumer performance budget, and R10 operational-readiness all succeed on the final branch head.

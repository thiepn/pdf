# P41 Acceptance Matrix

| ID | Requirement | Evidence |
| --- | --- | --- |
| P41-UX-01 | Tools uses outcome-first labels; everyday cleanup is Clean up PDF, not Sanitize PDF. | unit/browser regression |
| P41-UX-02 | Compression explains preserved-content vs image-based trade-offs without raster/stream pipeline language. | unit regression |
| P41-UX-03 | OCR raw confidence is hidden behind Recognition details. | unit regression |
| P41-UX-04 | Protect defaults use Overview, Clean up and Final check language, with detailed checks disclosed on demand. | unit regression |
| P41-UX-05 | Accessibility is the default standards surface; specialist PDF/A/print details remain available. | unit regression |
| P41-UX-06 | Batch presents recipes as workflows and does not label interchange buttons as JSON. | unit regression |
| P41-UX-07 | Diagnostics exposes System/Performance first and hides engine-specific laboratories behind Technical diagnostics. | browser regression |
| P41-UX-08 | Browser primitives and raw performance tables are behind technical disclosures. | browser/unit regression |
| P41-SAFE-01 | No document-processing, persistence, security-validation, schema, or output behavior changes. | diff review + full CI |
| P41-PERF-01 | Consumer performance budget remains green. | performance workflow |
| P41-OPS-01 | R10 operational-readiness policy remains green. | R10 workflow |

## Merge gate

Merge only after PDF Studio CI (including browser regression), Consumer performance budget, and R10 operational readiness all pass on the final head.

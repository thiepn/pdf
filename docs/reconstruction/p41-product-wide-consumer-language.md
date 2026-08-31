# P41 — Product-Wide Consumer Language & Progressive Disclosure Audit

## Goal

Extend the P36–P40 editor-language cleanup across the rest of PDF Studio. Everyday surfaces describe user outcomes and consequences first; implementation names and raw diagnostic measurements remain available only when they materially help troubleshooting or specialist work.

## Audited surfaces

- Global and current-document Tools
- Compress
- OCR
- Protect / Forms
- Accessibility and standards
- Batch automation
- Troubleshooting diagnostics and performance
- Route subtitles and operation status/error copy

## Decisions

- Tools remains outcome-first; remaining task labels/descriptions are simplified.
- Compression explains preserved-content versus image-based trade-offs rather than leading with raster/stream terminology.
- OCR confidence moves behind Recognition details.
- Protect uses Overview, Clean up and Final check language; detailed validation checks remain on demand.
- Accessibility becomes the default standards tab; PDF/A, print, signature and preflight concepts remain in specialist tabs.
- Batch presents recipes as workflows; JSON remains an internal interchange format rather than the button label.
- Diagnostics shows System and Performance first; PDF.js, MuPDF, coordinates, deployment and storage probes move under Technical diagnostics.
- Browser primitives and raw performance measurements move behind dedicated technical disclosures.

## Product boundary

No PDF bytes, OCR recognition logic, compression profiles, security rules, accessibility repair semantics, batch recipe schema, diagnostic collection, persistence behavior, worker routing, or release qualification behavior changes.

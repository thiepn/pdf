# F10 — Actual browser export corpus and local AcroForm CSV

## Implemented integration
F10 is stacked on the exact qualified F9 commit `7890c4449be6494616672901d4eed10207963871`. No changes to F8B Account, D-series release gates, screenshot goldens or production deployments.

**PdfCraft-inspired gap:** The Inspector already reports interactive forms, but did not offer direct user-invoked form-data interchange. An explicit "Export form data CSV" control now creates a local spreadsheet-compatible file from actual PDF form fields; no backend, Rust sources, upstream code, images, assets or branding are included.

CSV contract: stable columns (page, name, label, type, value, readOnly, signed), each widget as its own row; UTF-8 BOM, comma quoting, escaped double quotes and CRLF lines. Formula-looking names, labels and values are escaped to avoid spreadsheet execution. Password fields and signature payloads are intentionally omitted. The UI warns that other form data may be personal. Export only occurs on a user click, separately from the existing Inspector JSON report.

## Actual reader qualification
The F10 source corpus is deterministically synthesized with PyMuPDF and pypdf inside CI; no private data or binary golden replacement:

| Synthetic fixture | Actual application workflow | Required independent invariants |
|---|---|---|
| `forms.pdf` | Browser editor: add rectangle and download PDF | Existing AcroForm name/value/type/tooltip and page text preserved; exactly one new rendered Square |
| `comments-measurements.pdf` | Browser editor: add rectangle and download PDF | Original Text/Line annotation semantics and /Measure dictionary preserved; exactly one new rendered Square |
| `optimization.pdf` | Consumer quick Compress PDF and download | Original two pages, text, page geometry and annotation signatures retained |
| `batch-alpha.pdf` | F6 batch workflow/download | PDF integrity, source text and page geometry preserved |
| `batch-beta.pdf` | F6 batch workflow/download | PDF integrity, source text and page geometry preserved |

Browser-export artifacts are isolated by Playwright project name; the dedicated Chromium validator must read the exact `artifacts/f10-exports/chromium` subtree, avoiding concurrent cross-browser writes to shared PDF filenames. The validator fails on missing outputs, broken file headers, nonzero qpdf status, pypdf parsing or semantic changes, independent Poppler text/page mismatches, missing real forms/measurements and unexpected annotation changes. Both the dedicated F10 CI and inherited full CI run actual browser actions. The dedicated workflow uploads exported bytes and a machine-readable report for review.

## Boundaries
This is not a claim of PDF/A conformance, Excel macro security, Acrobat equivalence, trusted digital signatures or real-device certification. Existing F8B Account signoff, D-series fidelity/real-device acceptance and human/manual release decisions remain separate requirements. Do not merge, deploy, replace screenshot baselines or activate production APIs without approval.

## F11 — Extended compatibility and cross-browser certification
Extend beyond Chromium to independent viewer/print results, malformed/encrypted and interrupted-worker handling, annotation geometry with nonzero CropBox/Rotate, and cross-browser fidelity. Keep separate evidence for genuine human device/accessibility approvals.

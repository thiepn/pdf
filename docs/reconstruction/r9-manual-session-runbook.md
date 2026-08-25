# R9 Manual Human Session Runbook

This runbook is for the recorder/moderator. Do **not** show the canonical-destination tables to the tester during the session.

## 1. Prepare the exact product baseline

Human evidence must exercise the frozen R8 product commit:

`7c81f95815a3d8740fddef3d76e264ebb19c96f8`

From the current repository checkout:

```bash
git worktree add ../pdf-r9-baseline 7c81f95815a3d8740fddef3d76e264ebb19c96f8
```

In the baseline worktree:

```bash
cd ../pdf-r9-baseline
npm ci
npm run dev -- --host 127.0.0.1
```

Use that local R8 build for the session. Do not substitute a later `main` deployment merely because later commits are documentation/test-only.

## 2. Prepare the privacy-safe manual corpus

In the current R9 checkout:

```bash
python -m pip install --requirement requirements-phase11.txt
python scripts/reconstruction/r9_prepare_manual_corpus.py
```

This creates `.r9-manual-corpus/` containing only synthetic/committed non-sensitive assets:

- `plain-text.pdf`
- `mixed-pages.pdf`
- `redaction-source.pdf`
- `forms.pdf`
- `compress-source.pdf`
- `ocr-scan.pdf`
- `photo-source-1.png`
- `photo-source-2.png`
- `manifest.json`

`ocr-scan.pdf` is deliberately image-only and contains large raster text. `compress-source.pdf` is deliberately saved with repetitive uncompressed content so the compression task is meaningful rather than testing an already-optimized file.

Never substitute a confidential/personal PDF for the qualification corpus.

## 3. Create the session evidence file

Use a new anonymous tester ID for each person. Familiarity values: `none`, `light`, `experienced`. PDF experience values: `basic`, `regular`, `advanced`.

Example:

```bash
node scripts/reconstruction/r9_prepare_session.mjs \
  --session-id session-20260825-01 \
  --tester-id tester-01 \
  --familiarity none \
  --pdf-experience regular \
  --browser "Edge 151" \
  --os-device "Windows 11 laptop" \
  --viewport "1440x900" \
  --corpus-id r9-manual-v1
```

The generator creates a shuffled `measurement_order`. Follow that exact order. It does not fill any human results.

## 4. Standard starting state for every intent

For every D-item:

1. Return PDF Studio to **Home**.
2. Do not pre-open the destination or task screen.
3. Read only the neutral prompt for the current ID.
4. Ask: **“Before clicking anything, where would you expect to go to do that?”**
5. Record `predicted_location` verbatim but without personal information.
6. Set `matches_canonical` using the recorder-only mapping below.
7. Allow the tester to begin.
8. Record the **first location/control they deliberately choose** as `first_location`.
9. Record whether that first choice is correct, whether Help was used before the choice, and the meaningful-interaction count.
10. If this D-item maps to a C-item, continue the task immediately without Help and record the completion outcome. Do not repeat it later.

A meaningful interaction is a deliberate click/tap/keyboard action that changes route, opens a task/dialog, selects a mode, chooses a file, or executes a relevant control. Mouse movement, scrolling solely to read, and accidental clicks do not count.

Do not coach, hint, point at controls, explain terminology, or restart a failed item to turn it into a pass.

## 5. Neutral tester prompts

Use the wording below. Do not name the canonical destination.

| ID | Prompt |
| --- | --- |
| D01 | Using `plain-text.pdf`, change words that are already in the PDF. |
| D02 | Add a new piece of text to a PDF. |
| D03 | Replace a picture that is already inside a PDF. |
| D04 | Using `plain-text.pdf`, highlight a sentence. |
| D05 | Using `plain-text.pdf`, place a visible handwritten-style signature on the PDF. |
| D06 | Using `redaction-source.pdf`, permanently remove `SECRET_ALPHA_491` so it cannot be recovered from the exported PDF. |
| D07 | Combine `plain-text.pdf` and `mixed-pages.pdf` into one PDF. |
| D08 | Split a PDF into separate output files. |
| D09 | Take pages 1–2 from a multi-page PDF into a separate PDF. |
| D10 | Using `mixed-pages.pdf`, delete page 2 and move the last remaining page to the first position. |
| D11 | Change the order of pages in a PDF. |
| D12 | Rotate selected pages in a PDF. |
| D13 | Trim the visible margins of a PDF page. |
| D14 | Using `compress-source.pdf`, make the PDF file size smaller and export the result. |
| D15 | Using `ocr-scan.pdf`, make the scanned page searchable and export the result. |
| D16 | Remove author/title-style metadata from a PDF. |
| D17 | Make a PDF require a password when opened. |
| D18 | Using `forms.pdf`, fill the form fields with synthetic test values and export/save the result. |
| D19 | Turn `photo-source-1.png` and `photo-source-2.png` into one PDF. |
| D20 | Save PDF pages as image files. |

For D18 use non-sensitive values such as `R9 Tester`, `Yes`, and `France`. Never enter a real name or personal data.

## 6. Recorder-only canonical mapping

Do not reveal this table before or during the tester's measurement.

| ID | Canonical destination |
| --- | --- |
| D01 | Edit PDF |
| D02 | Edit PDF |
| D03 | Edit PDF |
| D04 | Annotate & comment |
| D05 | Add visual signature |
| D06 | Apply permanent redactions |
| D07 | Merge PDFs |
| D08 | Split PDF |
| D09 | Organize pages |
| D10 | Organize pages |
| D11 | Organize pages |
| D12 | Organize pages |
| D13 | Crop pages |
| D14 | Compress PDF |
| D15 | OCR PDF |
| D16 | Edit or remove metadata |
| D17 | Password-protect PDF |
| D18 | Fill PDF forms |
| D19 | Scan to PDF |
| D20 | Export PDF content |

A direct shortcut counts as correct only when it routes directly into the same canonical workflow. A generic intermediate action such as merely opening a PDF does not count as the canonical first location.

## 7. Concurrent no-Help completion mapping

Record the C-item during the corresponding D-item's **first exposure**:

| C ID | During | Completion requirement |
| --- | --- | --- |
| C01 | D01 | Existing text is changed and a valid PDF is exported. |
| C02 | D04 | Requested text is highlighted and the result is saved/exported. |
| C03 | D05 | A visible signature is placed and the result is saved/exported. |
| C04 | D06 | Target is permanently redacted in the exported PDF. |
| C05 | D07 | Both source PDFs are combined into one valid output. |
| C06 | D10 | Page 2 is deleted, the last remaining page is moved first, and a valid output is exported. |
| C07 | D14 | A valid output smaller than `compress-source.pdf` is produced. |
| C08 | D15 | OCR completes and `SEARCHABLE AFTER OCR 2026` can be found/selected in the result. |
| C09 | D18 | Form values are changed using synthetic data and preserved in the result. |
| C10 | D19 | Both generated PNGs become pages in one valid PDF. |

Set `completed_without_help=true` only when the tester reaches the intended valid result without Help or task-specific assistance.

## 8. Result vocabulary

For each C-item use one of:

- `PASS`
- `PASS WITH EXPECTED LIMITATION`
- `BLOCKED CORRECTLY`
- `FAIL`

The boolean `completed_without_help` is the metric input. The result label provides context; do not use a favorable label to override a failed boolean.

## 9. Validate immediately after the session

Run:

```bash
node scripts/reconstruction/r9_validate_evidence.mjs \
  docs/reconstruction/evidence/r9/sessions/session-20260825-01.json
```

A valid passing single session should normally report `HUMAN_UX_SAMPLE_INSUFFICIENT`, not `HUMAN_UX_TARGET_MET`, because R9 requires at least three distinct testers.

After all sessions are committed/present, aggregate with:

```bash
node scripts/reconstruction/r9_validate_evidence.mjs
```

## 10. Certification sample

`HUMAN_UX_TARGET_MET` requires all of the following:

- at least 3 valid sessions;
- at least 3 distinct testers;
- at least 2 testers with `none` or `light` prior familiarity;
- each individual session >=90% on all three metrics;
- aggregate >=90% on all three metrics;
- no unresolved critical/data-loss defect.

If a tester exposes a real defect, record it. Do not coach around it merely to preserve the benchmark score.

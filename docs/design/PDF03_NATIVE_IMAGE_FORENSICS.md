# PDF-03 — Native masked-image forensic boundary (5 November 2026)

## Immutable baselines
- PR #164 (PDF-01/02): `2efd6c0c2427d3ee7ec71dcad00b57bc4040c3ff`, original exact-head integration 41869604415 and R10 41869604333 successful.
- `main`: `52166ed4c454db32e52d5260f82479ea289b1462` — not modified.
- D19 PR #152: `49b09e279291e6bfeb257f8c7fb835a750efd1e8` — this is a separate draft descendant; D19 remains unchanged.
- P18 PR #122: `3a77789c2c6d1b9520a20d338c9ad301e5894ee0` — not modified.

## Original primary-source browser evidence
- Real full PDF Studio CI: https://github.com/thiepn/pdf/actions/runs/37981651394
- Original retained Firefox Playwright artifact: `11643069405`, `phase30-playwright-report-firefox-1`.
- In the artifact's embedded `report.json`, `d14-native-export.spec.mjs` and `p17-native-fidelity.spec.ts` each failed with genuine initial-attempt and retry traces. The P17 trace is `data/133b1d30c4582e1441c82ab2da824571420a72ea.zip`; the D14 trace is `data/a7f0e8a3ec38c63238fdf7d6d3c11d204da55e9e.zip`.
- Both original `0-trace.trace` files contain the native-worker console error `warning: dropping unclosed device` at `/pdf/assets/native-image.worker-DCUP8aVF.js`.
- The real browser failure remains masked-image discovery: the four fixture images render, but the two /SMask images are classified as ambiguous, inherited-clipped and fidelity-protected, with no uniquely qualified /Do-to-rendered-paint identity. D14 fails before a downloaded-PDF/reopen assertion.
- D19 Node MuPDF test verifies actual PDF-space `(402,474,70,50)` maps through the inverse page transform to rendered `(402,268,70,50)`, and it obtains two matches. This is NOT equivalent to the unresolved browser classification.

## Narrow independent runtime defect repaired here
The native-image worker created a MuPDF Device, ran page contents and called `destroy()` without calling `close()`. MuPDF's Device documentation prescribes `close()` after balanced painting and before destruction. This draft inserts `close()` in `finally` and still always destroys the device. If close itself fails, the operation fails closed instead of incorrectly accepting uncertain evidence. No matching tolerances, classification rules, native writers, PDF bytes, migrations or production code outside this lifecycle were modified.

New `tests/e2e/pdf03-device-lifecycle.spec.ts` uses the actual generated P17 four-image fixture, the real built browser/WebAssembly worker and a native-worker-scoped console assertion. The test does not claim that two masked images became editable or that a PDF export succeeded.

## Remaining mandatory failure gates
1. Produce direct browser evidence for each `directImagePaints`, actual page transform, `directMaskedInvocationBounds`, rendered device rectangle, and the unique-match refusal reason; differentiate worker/Node runtime without inferring the root cause from the lifecycle warning.
2. Fix only the evidenced mapping/graphics-state defect without relaxing the fail-closed mask, clip, blend, sibling or output-reopen guards.
3. Download and independently reopen edited PDFs across Chromium/Firefox/WebKit, verifying four instances, two attached soft masks, correct moved target, unchanged sibling, and no collateral edits.
4. Run D19/D18/P17/D14, full historical CI and independent external readers. P18 physical, accessibility, recovery and genuine human acceptance remain `NOT_QUALIFIED`.
5. Treat this entire branch as investigation-only. Do not merge, deploy, tag, sign, publish or migrate data.

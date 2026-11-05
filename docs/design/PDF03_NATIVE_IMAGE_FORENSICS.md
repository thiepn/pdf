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

## Reproduced direct-invocation root cause (actual worker)

A focused Node/Vitest regression invokes the **actual** `src/workers/native-image.worker.ts` and the P17 PDF fixture, not a reimplementation of the geometry helper:

- Failing-before [source CI 41951466367](https://github.com/thiepn/pdf/actions/runs/41951466367): real page transform `[1,0,0,-1,0,792]`; `directImagePaints` correctly found four paints (two `ImSoft` /SMask invocations, a clipped plain instance, and Multiply plain); `directMaskedInvocationBounds` returned `[]`.
- Root cause: its non-ASCII guard was written as `/[^\\\\x09\\\\x0a\\\\x0d\\\\x20-\\\\x7e]/` with doubled backslashes inside a **regex literal**. This falsely rejects legitimate printable PDF text, before applying any coordinate transform or unique-match verification.
- Scoped fix: change the guard to `/[^\\x09\\x0a\\x0d\\x20-\\x7e]/`, preserving refusal of invalid binary/control characters. A new negative unit regression injects a zero byte and confirms the guard still refuses it. No mask/clip/blend eligibility or matching tolerance is relaxed.
- First exact-head green targeted source test on [D19 CI 41951793815](https://github.com/thiepn/pdf/actions/runs/41951793815): **28/28 targeted tests pass**, including real worker inventory/negative guard. The pre-existing D16 release ancestry gate still **fails closed** (`Production main moved or is not fetched; manual reconciliation required`); therefore this workflow's three browser jobs are skipped. **Do not misstate this as green D19 or browser qualification.**
- A separate additive, non-release focused workflow `.github/workflows/pdf03-focused-real-browser.yml` tests actual source and Chromium/Firefox/WebKit with original P17 and D14 download/reopen gates. This does **not** bypass or amend the blocking D16 release policy.

## Narrow independent runtime defect repaired here
The native-image worker created a MuPDF Device, ran page contents and called `destroy()` without calling `close()`. MuPDF's Device documentation prescribes `close()` after balanced painting and before destruction. This draft inserts `close()` in `finally` and still always destroys the device. If close itself fails, the operation fails closed instead of incorrectly accepting uncertain evidence. Outside the separately proven ASCII-guard fix described above, no matching tolerances, classification rules, native writers, PDF bytes, migrations or production code outside this lifecycle were modified.

New `tests/e2e/pdf03-device-lifecycle.spec.ts` uses the actual generated P17 four-image fixture, the real built browser/WebAssembly worker and a native-worker-scoped console assertion. The test does not claim that two masked images became editable or that a PDF export succeeded.

## Remaining mandatory failure gates
1. Run the new independent focused actual-browser workflow to verify that the Node-proven ASCII parser repair also qualifies two masks in Chromium/Firefox/WebKit; evaluate any new real failure without weakening refusal.
2. Preserve the strict source identity, one-to-one device paint match, inherited clipping/blend protection and post-export validation; no inferred editability from /Do alone.
3. Download and independently reopen edited PDFs across Chromium/Firefox/WebKit, verifying four instances, two attached soft masks, correct moved target, unchanged sibling, and no collateral edits.
4. Reconcile the historical D16 ancestry policy failure with the now-current production main without bypassing it; rerun D19/D18/P17/D14, full historical CI and independent external readers. P18 physical, accessibility, recovery and genuine human acceptance remain `NOT_QUALIFIED`.
5. Treat this entire branch as investigation-only. Do not merge, deploy, tag, sign, publish or migrate data.

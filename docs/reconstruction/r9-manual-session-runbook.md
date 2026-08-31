# R9 Manual Human Session Runbook — P43 Physical-Device Baseline

This runbook is for the recorder/moderator. Do **not** show the recorder's canonical destinations to the tester.

## 1. Use the exact qualification product

Human evidence must exercise this frozen consumer baseline:

`be223e37d3ecafe6695aa6fe4fe7f901f95f478c`

P43 evidence/tooling commits do not change that product baseline.

When testing on another physical device, serve an exact build of that commit from a reachable local/test host. Do not substitute a later `main` build unless the qualification baseline has been formally re-frozen.

The older R8 operational baseline is not the P43 human-test product.

## 2. Prepare the privacy-safe corpus

```bash
python -m pip install --requirement requirements-phase11.txt
python scripts/reconstruction/r9_prepare_manual_corpus.py
```

Use only the generated/synthetic corpus. Do not use personal or confidential PDFs.

## 3. Record the physical environment first

Before generating a session, confirm that the tester is actually using physical hardware. Browser device emulation, iOS/Android simulators, virtual mobile devices, Playwright, Selenium, Puppeteer, remote CI browsers, or AI agents do not qualify.

Record exact OS and browser versions from the device/browser itself.

Allowed structured values include:

- device class: `desktop`, `laptop`, `phone`, `tablet`;
- OS family: `windows`, `macos`, `android`, `ios`, `ipados`, `linux`;
- browser family: `chromium`, `safari-webkit`, `firefox`;
- input mode: `keyboard-mouse`, `keyboard-trackpad`, `touch`, `touch-keyboard`;
- app mode: `browser`, `installed-pwa`.

Do not record serial numbers, account identifiers, email addresses, or personal device names.

## 4. Generate one human-session file

Example Windows/Edge physical-laptop session:

```bash
node scripts/reconstruction/r9_prepare_session.mjs \
  --session-id session-20260831-01 \
  --tester-id tester-01 \
  --familiarity none \
  --pdf-experience regular \
  --device-class laptop \
  --device-model "Windows laptop" \
  --os-family windows \
  --os-version "Windows 11 24H2" \
  --browser-family chromium \
  --browser-name "Microsoft Edge" \
  --browser-version "152.0.0" \
  --input-mode keyboard-trackpad \
  --viewport 1440x900 \
  --app-mode browser \
  --attest-physical-device yes \
  --date 2026-08-31
```

`--attest-physical-device yes` is a human assertion by the recorder. Do not use it for an emulator or automated run.

The generator fills metadata and a deterministic shuffled `measurement_order`. It does not fill any observation/result.

## 5. Use the offline recorder

Open:

`docs/reconstruction/r9-session-recorder.html`

in a recorder-only browser window. Load the generated JSON.

The recorder rejects:

- pre-P43 schema files;
- missing physical-device evidence source;
- simulator/emulator evidence;
- automation-observation evidence;
- missing human attestation.

Keep the recorder outside the tester's view because it displays canonical destinations for scoring.

## 6. Standard procedure for every D-item

For every item in the generated shuffled order:

1. Return PDF Studio to Home.
2. Do not pre-open the destination/task screen.
3. Read only the neutral prompt shown by the recorder.
4. Ask where the tester expects to go **before clicking anything**.
5. Record the prediction without personal information.
6. Allow navigation.
7. Record the first deliberate location/control chosen.
8. Record correctness, Help-before-choice, and meaningful interaction count.
9. When the item maps to C01–C10, continue the same first exposure without Help and record the completion outcome.
10. Do not repeat a failed item to convert it into a pass.

Do not coach, hint, point at controls, explain where a task is, or expose another tester's result.

A meaningful interaction is a deliberate click, tap, or keyboard action that changes route, opens a task/dialog, selects a mode/file, or executes a relevant control. Passive reading/scrolling and accidental actions do not count.

## 7. Frozen task set

The 20 neutral prompts and canonical mappings are frozen in:

- `docs/reconstruction/r9-session-recorder.html`;
- `docs/reconstruction/r9-human-usability-qualification.md`.

The no-Help completion mapping remains:

| Completion | Discovery |
| --- | --- |
| C01 Edit existing text | D01 |
| C02 Highlight text | D04 |
| C03 Sign visually | D05 |
| C04 Permanently redact | D06 |
| C05 Merge PDFs | D07 |
| C06 Delete/reorder pages | D10 |
| C07 Compress PDF | D14 |
| C08 OCR scan | D15 |
| C09 Fill form | D18 |
| C10 Images to PDF | D19 |

For form entry use synthetic values only.

## 8. Result vocabulary

For each C-item use one of:

- `PASS`;
- `PASS WITH EXPECTED LIMITATION`;
- `BLOCKED CORRECTLY`;
- `FAIL`.

`completed_without_help` is the human metric. The contextual result label cannot override a failed boolean.

## 9. Defects

Record defects with non-sensitive descriptions. An unresolved critical or data-loss defect blocks certification.

Preserve failures rather than coaching around them. A product defect should produce a separate maintenance fix and requalification, not edited evidence.

## 10. Validate the completed session

After replacing the generated placeholder file with the recorder export:

```bash
node scripts/reconstruction/r9_validate_evidence.mjs \
  docs/reconstruction/evidence/r9/sessions/session-20260831-01.json
```

A good first session normally reports `HUMAN_UX_SAMPLE_INSUFFICIENT`, because the sample gate needs at least three distinct humans.

Aggregate all committed human sessions:

```bash
node scripts/reconstruction/r9_validate_evidence.mjs
```

## 11. Human target

`HUMAN_UX_TARGET_MET` requires:

- at least 3 valid physical-device sessions;
- at least 3 distinct testers;
- at least 2 testers with none/light familiarity;
- every session >=90% on first-location, no-Help completion, and navigation prediction;
- aggregate >=90% on all three metrics;
- no unresolved critical/data-loss defect.

Human target success is necessary but no longer sufficient for the final R9 certificate. P43 also requires `REAL_DEVICE_TARGET_MET` from the physical device-journey matrix.

## 12. Real-device follow-through

Use `scripts/reconstruction/r9_prepare_device_run.mjs` plus `p43-real-device-run-template.json` for the lighter J01–J10 platform runs. Follow `p43-real-device-human-evidence.md` until all five required device slots, all ten journeys, and installed-PWA J10 coverage are satisfied.

Then validate status and certification:

```bash
node scripts/reconstruction/r9_status_contract.mjs
node scripts/reconstruction/r9_certify_evidence.mjs --out docs/reconstruction/evidence/r9/certification.json
```

The certifier must refuse if either the human layer or real-device layer is incomplete.

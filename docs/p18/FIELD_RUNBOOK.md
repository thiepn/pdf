# P18 — Field Qualification Runbook

## Frozen target

Product baseline:

`95a8e84f13984e870a0518d8c4e8007a6ee1b7e2`

Qualification URL:

`https://thiepn.github.io/pdf/qualification/v72-p18/`

Do not collect P18 evidence against the Stable root or another development commit.

## Before any physical-device run

The Stable service worker is scoped under `/pdf/`, so isolate the qualification session:

1. close installed Stable PDF Studio PWAs;
2. clear site data/service workers for `thiepn.github.io`, or use a fresh browser profile that has not opened the Stable root;
3. open the P18 qualification URL directly;
4. do not visit `https://thiepn.github.io/pdf/` during the observation;
5. for an installed-PWA run, install from the P18 URL and confirm reopening returns to `/pdf/qualification/v72-p18/`;
6. download `release-integrity.json` from the P18 URL and use it when preparing the device record.

This is environment isolation, not a hint to the tester.

## Step 1 — Real-world cases

Use real documents that are safe for local testing. Do **not** commit their bytes.

P18 requires aggregate coverage of:

- malformed;
- scanned;
- form-heavy;
- encrypted;
- signed;
- multilingual;
- large.

A single document may cover several categories if that is genuinely true.

Generate hash-only metadata:

```bash
node scripts/p18/prepare-real-world-case.mjs \
  --file "/local/path/source.pdf" \
  --case-id "rw-20261007-01" \
  --categories "signed,form-heavy" \
  --origin "public" \
  --page-count 12 \
  --out "docs/p18/evidence/real-world/rw-20261007-01.json"
```

The local path is used only to compute SHA-256/size and is not written to evidence.

Open/use the case in the frozen P18 qualification build, then change only `product_result` from `NOT_RUN` to the result actually observed. A category counts only from a case with `PASS` or `PASS WITH EXPECTED LIMITATION`. `FAIL` blocks qualification; `BLOCKED CORRECTLY` preserves an honest boundary but does not satisfy category coverage. Record defects by GitHub issue reference.

## Step 2 — Execute W01–W05 and preserve exact outputs

- **W01:** layout-aware PDF → DOCX.
- **W02:** qualified Arabic/RTL existing-text edit → PDF.
- **W03:** target-size compression → PDF.
- **W04:** Batch v4 using an encrypted queue item → PDF.
- **W05:** qualified deep native-content edit → PDF.

Keep the exported file until both external-reader and device observations that reference it are recorded. Evidence stores only its SHA-256, not the bytes.

## Step 3 — External applications

For W01, use an external office reader such as Microsoft Word or LibreOffice Writer.

For W02–W05, use at least two PDF-reader families in aggregate. At least one must be native/non-browser, such as Adobe Acrobat Reader, macOS Preview, PDF24, Android native viewer, or iOS Quick Look.

Generate a record:

```bash
node scripts/p18/prepare-external-reader-run.mjs \
  --artifact "/local/path/output.pdf" \
  --workflow W05 \
  --source-case-id "rw-20261007-01" \
  --run-id "reader-20261007-adobe-01" \
  --application-family adobe-acrobat \
  --application-name "Adobe Acrobat Reader" \
  --application-version "EXACT_VERSION" \
  --os-family windows \
  --os-version "EXACT_VERSION" \
  --page-count 12 \
  --out "docs/p18/evidence/external-readers/reader-20261007-adobe-01.json"
```

Then edit only the `checks[].result` fields to what was actually observed. Do not pre-fill PASS.

## Step 4 — Physical phone/tablet/PWA

Required aggregate slots:

- one physical phone;
- one physical tablet;
- one installed-PWA run on a physical device.

Across device runs, W01–W06 must all qualify. **W06** is reload/offline/installed-PWA reopening and recovery.

Prepare a run skeleton:

```bash
node scripts/p18/prepare-device-run.mjs \
  --release-integrity-file "/local/path/release-integrity.json" \
  --run-id "device-20261007-phone-01" \
  --tester-id "anon-01" \
  --date "2026-10-07" \
  --device-class phone \
  --device-model "NON_SENSITIVE_MODEL" \
  --os-family android \
  --os-version "EXACT_VERSION" \
  --browser-family chromium \
  --browser-name Chrome \
  --browser-version "EXACT_VERSION" \
  --input-mode touch \
  --viewport "390x844" \
  --app-mode installed-pwa \
  --out "docs/p18/evidence/device-runs/device-20261007-phone-01.json"
```

For each actually performed W01–W05 result, fill `source_case_id` and the SHA-256 of the exact output observed. Leave unperformed workflows as `NOT_RUN`. W06 has no source/output hash.

A low-burden allocation is:

| Environment | Primary workflows |
| --- | --- |
| desktop external apps | W01–W05 reopen checks |
| physical phone, installed PWA | W02, W03, W04, W06 |
| physical tablet | W01, W05 |

This is an allocation suggestion only. A result counts only if it was actually performed.

## Result vocabulary

External checks:

- `PASS`
- `PASS WITH EXPECTED LIMITATION`
- `FAIL`
- `NOT_RUN`

Device workflows additionally allow `BLOCKED CORRECTLY`, but that does **not** satisfy required successful coverage.

## Defects

Do not store a free-form defect description in evidence. Open a GitHub issue and record only:

```json
{"issue":"#123","severity":"high","category":"compatibility","status":"open"}
```

Preserve failed evidence permanently. A retry after a fix is a new file/run ID.

If consumer behavior changes, P18's frozen baseline is invalid: create a new baseline and rerun affected evidence.

## After every evidence contribution

Update `docs/p18/status.json` to the state derived by:

```bash
node scripts/p18/qualification-evidence.mjs
```

Then run:

```bash
npm run status:p18
npm run audit:p18:field-host
```

Do not edit observations merely to make the status pass.

## Certification

```bash
npm run certify:p18
```

Only `P18_V72_QUALIFIED` permits P19/version-cut work.

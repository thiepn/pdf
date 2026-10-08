# P18 — Compatibility & Human/Device Qualification

P18 implements **V72-06**. It is a release-qualification phase, not another feature phase.

## Frozen product under test

P18 freezes the P17 runtime at:

`b2ec1a3e5042a1606c058ad80fe3aa8483ac6621`

That commit remains version **7.1.4** on the pre-cut v7.2 line. P18 changes qualification tooling, evidence contracts, tests, and deployment controls only. It must not change consumer product source. Project/database/native-editor formats remain **9 / 13 / 6**.

The currently published Stable root is **v7.1.4** at commit:

`2116a61b73b6fdb18aa19a8175d9ebae4b43c159`

## Four evidence layers

### 1. Automated compatibility

Automation may prove regression behavior, corpus handling, build integrity, and browser-engine behavior. P18 combines:

- the Phase 28 adversarial corpus;
- malformed, encrypted, form-heavy, multilingual and large committed fixtures;
- browser-generated scan/OCR coverage;
- signature-analysis regressions;
- P13–P17 unit/audit gates;
- Chromium, Firefox and WebKit browser qualification;
- mobile Chromium and tablet WebKit emulation.

**Automation never satisfies real-world, external-reader, or physical-device evidence.**

### 2. Real-world source cases

P18 requires human-attested hash-only metadata for these categories:

- malformed;
- scanned;
- form-heavy;
- encrypted;
- signed;
- multilingual;
- large.

Do not commit the source files merely to satisfy qualification. Store only SHA-256, byte/page counts, category membership and non-sensitive origin class. A category counts only after a human actually exercises that case in the frozen P18 build and records PASS or PASS WITH EXPECTED LIMITATION; registering a hash alone never counts.

The repository has signature-analysis tests but no genuine signed-PDF corpus file. A real signed document is therefore a mandatory field case rather than a fabricated fixture.

### 3. External application/readers

Every V72 output workflow must be reopened outside PDF Studio.

- **W01** — layout-aware PDF → DOCX: external office reader.
- **W02** — Arabic/RTL existing-text edit: external PDF reader.
- **W03** — target-size compression: external PDF reader.
- **W04** — Batch v4/encrypted queue output: external PDF reader.
- **W05** — deep native-content edit: external PDF reader.

Every observation records the exact output SHA-256, exact application version and OS version.

Aggregate acceptance requires:
- W01–W05 all covered;
- at least two distinct PDF-reader families;
- at least one native/non-browser PDF reader;
- at least one external office reader for DOCX;
- no observed FAIL or blocking defect.

### 4. Physical-device evidence

P18 requires genuine human observation on:

- a physical phone;
- a physical tablet;
- an installed PWA on a physical device.

Across the device runs, W01–W06 must all qualify. W06 is reload/offline/installed-PWA reopening and recovery.

Playwright device emulation, simulators, CI, screenshots interpreted by AI, or synthetic records do not count.

## Failure policy

Preserve failed evidence. Never overwrite a failed run with a retry.

P18 remains blocked by:
- unresolved data-loss defects;
- unresolved compatibility defects;
- unresolved critical/high product defects;
- any required external-reader FAIL;
- any required physical-device workflow FAIL;
- incomplete real-world category coverage;
- missing source/output/build identity.

A fix that changes consumer behavior creates a new product baseline. Evidence from the previous baseline cannot be silently carried forward.

## Privacy

Do not commit:
- passwords;
- private filenames;
- document contents or extracted/OCR text;
- document bytes;
- screenshots of private material;
- names/emails/account IDs;
- device serial numbers.

Use anonymous tester IDs and hash-only source/output identity.

## Commands

```bash
npm run check:p18
npm run status:p18
npm run certify:p18
```

`check:p18` validates the framework and automated contracts.

`status:p18` derives the current human evidence state. It is expected to report **NOT_QUALIFIED** until actual field evidence is committed.

`certify:p18` is intentionally fail-closed. It exits non-zero until all three human evidence layers reach target.

## Current state

At framework creation there is no P18 human evidence. The only valid state is:

- `REAL_WORLD_UNMEASURED`;
- `EXTERNAL_READER_UNMEASURED`;
- `PHYSICAL_DEVICE_UNMEASURED`;
- `NOT_QUALIFIED`.

## Handoff

Only **P18_V72_QUALIFIED** permits **P19 — v7.2 Release Candidate, Atomic Version Cut & Promotion Readiness**.

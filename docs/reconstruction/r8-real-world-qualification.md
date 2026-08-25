# R8 — Real-world Qualification & Reconstruction Release Freeze

## 1. Purpose

R8 is the final reconstruction phase. It does not expand PDF Studio's feature set. It proves that the reconstructed product can be released without returning to feature-count-driven development.

R8 qualifies four separate claims:

1. **Engineering reliability** — the existing deterministic release chain remains green.
2. **Representative document compatibility** — qualification covers at least 100 varied PDFs, including externally sourced documents.
3. **Workflow/product structure** — all 40 frozen golden workflows have a canonical task and executable or implementation evidence; top user intents resolve through the reconstructed IA.
4. **Human usability** — only evidence from an actual manual session may upgrade the R0 human findability/no-Help metrics.

Automation must never be relabeled as human usability evidence.

## 2. Corpus contract

R8 combines four corpora:

- Phase 11 deterministic generated corpus;
- Phase 28 adversarial corpus;
- P8 compatibility corpus;
- R8 external corpus.

The external corpus is generated in CI from the public `mozilla/pdf.js` test corpus at the immutable upstream commit:

`a570239153c3af4508c3f06348dff35faa313737`

Selection is deterministic and requires:

- `.pdf` source;
- 20 KB to 2 MB source size;
- no password requirement;
- 1–200 pages;
- successful PyMuPDF open;
- successful pypdf page-tree open;
- matching independent page counts.

Exactly 25 external PDFs are selected by a deterministic hash ordering of upstream filename. The CI workspace may contain those public third-party bytes, but the repository/evidence artifact stores only provenance, hashes, sizes, page counts, and reader results.

**R8 aggregate target: >=100 PDFs.**

With the established corpus sizes this normally yields at least 101 PDFs (11 Phase 11 + 56 Phase 28 + 9 P8 + 25 external), but the validator counts actual generated files rather than trusting historical numbers.

## 3. External-browser qualification

The full external corpus is independently parsed before browser tests. A representative six-document subset is then opened through the real PDF Studio import/viewer path in Chromium.

This is additive to the existing browser matrix, which continues to qualify Chromium, Firefox, WebKit, phone Chromium, and tablet WebKit using the deterministic corpora.

## 4. Golden workflow evidence

The frozen GW-01 through GW-40 set remains authoritative.

`scripts/reconstruction/r8_qualification.mjs` verifies that:

- all 40 workflow IDs are mapped;
- every workflow maps to an existing canonical task;
- every mapping references an existing executable regression or implementation surface that is exercised by the exact-head release chain;
- canonical task IDs and labels remain unique;
- no reconstruction phase silently deletes a golden-workflow entry point.

This mapping is an evidence-index integrity check. It does **not** convert source-file existence into a workflow PASS. Actual automated pass/fail remains governed by the exact-head unit/runtime/Playwright/release jobs.

## 5. Discoverability qualification

R8 adds natural-language task matching shared by Tools and Ctrl/Cmd+K.

The structural top-20 benchmark uses user-language phrases such as:

- `make this PDF smaller`;
- `remove pages 4 through 7`;
- `make this scan searchable`;
- `permanently hide this account number`;
- `turn photos into a PDF`.

The expected canonical task must be the **first matching task** for at least 90% of the frozen top-20 set. The browser regression additionally verifies that all 20 prompts visibly reveal their expected task.

This result is reported as **structural discovery**, not human first-location accuracy.

## 6. Human metrics remain evidence-bound

The following R0 metrics cannot be honestly established by CI alone:

- human top-20 first-location accuracy;
- human top-10 no-Help completion;
- navigation prediction accuracy.

They remain `UNMEASURED` until a manual run records the fields in `manual-qualification-template.md` against a specific commit and environment.

R8 therefore distinguishes:

- **engineering/reconstruction freeze** — may be certified automatically;
- **human usability target certification** — requires manual evidence.

No R8 document may state that the human targets passed merely because the automated structural proxy passed.

## 7. Release-blocking automated targets

The R8 engineering freeze requires all of the following on one exact branch head:

- Consumer performance budget PASS;
- Phase 11 stability PASS;
- P8 compatibility corpus PASS;
- P9 freeze audit PASS;
- v7 non-browser release qualification PASS;
- reproducible build PASS;
- high-severity dependency security PASS;
- source audit PASS;
- R8 aggregate corpus >=100 PDFs;
- R8 external corpus =25 independently readable PDFs;
- R8 structural top-20 first-result accuracy >=90%;
- all 40 golden workflows mapped to a canonical task/evidence surface;
- verified-distribution Playwright/privacy matrix PASS;
- R8 natural-language discovery browser regressions PASS;
- R8 external-PDF opening browser regression PASS;
- zero known critical/data-loss defects discovered by the qualification run.

A failed gate blocks the freeze. It must be fixed and the new exact head requalified.

## 8. Allowed R8 code changes

R8 may change product code only when qualification exposes a defect in:

- discoverability;
- reliability;
- truthful capability gating;
- workflow completion;
- output validation;
- responsive behavior;
- accessibility;
- security/privacy;
- release infrastructure.

No new feature is justified merely because R8 is the final phase.

## 9. Freeze semantics

After an exact head passes every automated R8 gate:

1. the PR body records that exact head and automated evidence;
2. the branch is not changed after certification;
3. the PR is merged using `expected_head_sha`;
4. `main` becomes the authoritative reconstructed source;
5. subsequent work is maintenance/bug-fix work unless a new product roadmap is explicitly opened.

The reconstruction release may be described as **engineering-certified and frozen**. Human usability metrics must still be described by their recorded status.

## 10. Final state vocabulary

- `R8_AUTOMATED_CERTIFIED` — all automated R8 gates pass on one exact head.
- `R8_RECONSTRUCTION_FROZEN` — that exact head is merged into `main` without intervening source changes.
- `HUMAN_UX_UNMEASURED` — no qualifying manual usability session exists yet.
- `HUMAN_UX_TARGET_MET` — a qualifying manual session meets the R0 targets.
- `HUMAN_UX_TARGET_MISSED` — a qualifying manual session exists and misses one or more R0 targets.

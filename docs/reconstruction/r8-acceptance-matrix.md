# R8 Acceptance Matrix

## Automated reconstruction freeze

| ID | Requirement | Evidence | Required result |
| --- | --- | --- | --- |
| R8-01 | Branch begins from certified R7 `main` | Git ancestry | PASS |
| R8-02 | Feature expansion remains frozen | R8 diff review | PASS |
| R8-03 | External corpus is pinned to immutable upstream commit | `r8_external_corpus.py` | PASS |
| R8-04 | At least 25 external PDFs independently open in PyMuPDF and pypdf | `tests/corpus/r8-external/manifest.json` | PASS |
| R8-05 | Aggregate qualification corpus contains >=100 PDFs | `r8-corpus-report.json` | PASS |
| R8-06 | All 40 golden workflows retain canonical task mappings | `r8-structural-qualification.json` | PASS |
| R8-07 | Canonical task IDs and labels have no duplicates | R8 structural audit | PASS |
| R8-08 | Structural top-20 first-result discovery is >=90% | R8 structural audit + Playwright | PASS |
| R8-09 | Top-20 structural locate depth is <=2 | task architecture audit | PASS |
| R8-10 | Top-10 canonical entry proxy is complete | R8 structural audit | PASS |
| R8-11 | Natural-language task phrases work in Tools | `r8-release-qualification.spec.ts` | PASS |
| R8-12 | Natural-language task phrases work in Ctrl/Cmd+K | `r8-release-qualification.spec.ts` | PASS |
| R8-13 | Representative externally sourced PDFs open through PDF Studio | `r8-release-qualification.spec.ts` | PASS |
| R8-14 | Existing deterministic release chain remains green | PDF Studio CI | PASS |
| R8-15 | Reproducible production build remains green | PDF Studio CI | PASS |
| R8-16 | High-severity dependency security gate remains green | PDF Studio CI | PASS |
| R8-17 | Verified-distribution privacy/browser matrix remains green | PDF Studio CI | PASS |
| R8-18 | Consumer performance budget remains green | performance workflow | PASS |
| R8-19 | Zero known critical/data-loss defects remain from R8 qualification | PR defect log | PASS |
| R8-20 | Certified branch head is merged without intervening source changes | `expected_head_sha` merge | PASS |

## Human usability evidence

These metrics remain governed by R0's measurement policy and **must not be inferred from CI**.

| ID | Metric | R0 target | R8 automated status |
| --- | --- | --- | --- |
| R8-H01 | Human top-20 first-location accuracy | >=90% | UNMEASURED |
| R8-H02 | Human top-10 no-Help completion | >=90% | UNMEASURED |
| R8-H03 | Human navigation prediction accuracy | >=90% | UNMEASURED |

A future manual session may update these three metrics using `manual-qualification-template.md`. It does not require reopening the engineering reconstruction unless it exposes a release-blocking product defect.

## Result interpretation

R8 is **engineering-certified** only when R8-01 through R8-20 pass on one exact head.

The phrase **human usability certified** is prohibited while R8-H01 through R8-H03 remain `UNMEASURED`.

# D19 — Release acceptance packet and evidence handoff

**Repository:** `thiepn/pdf`  
**Candidate:** [D19 draft PR #152](https://github.com/thiepn/pdf/pull/152) stacked on D18 #151 → D17 #150 → D16 #149 → D15 #148 → D14 #147 → D13 #145.  
**Decision:** `NOT_QUALIFIED` — **NO MERGE / TAG / DEPLOY**. This packet prepares *evidence collection*, not approval.

## 1. Exact D18 intake

D18 PR #151 head was `1944baba69255362351d660ded5c17b33f17ca58`. On 9 October 2026, full CI, P17, D14, D15, D16, D17, D18, D7 **failed**, while D3, D4, D6, R10, consumer performance and the read-only Pages job **succeeded**.

- [D18 CI 37953680596](https://github.com/thiepn/pdf/actions/runs/37953680596): **1 native unit test failed**, 23 passed in focused set. Real MuPDF independently reopened the fixture and rendered at least four images, but `matchRenderedMaskedInvocations` returned zero rather than two. Three-browser/mobility D18 children were skipped because the source gate failed.
- [P17 37953679535](https://github.com/thiepn/pdf/actions/runs/37953679535): source tests passed, **Chromium browser masked source still fidelity-protected**, with no qualifying masked object available to transform.
- [D16 matrix 37953679228](https://github.com/thiepn/pdf/actions/runs/37953679228): ancestry/evidence preflight passed; Chromium/Firefox/WebKit failed masked native download/reopen.
- [D14 browser 37953679298](https://github.com/thiepn/pdf/actions/runs/37953679298): source tests passed; all three native-export browser jobs failed.
- [Full CI 37953679267](https://github.com/thiepn/pdf/actions/runs/37953679267): Phase 11 gate passed, validation failed on the same D18 native unit, browser CI was not qualified.
- [D7 accessibility 37953679379](https://github.com/thiepn/pdf/actions/runs/37953679379): compact phone test attempted an obsolete toolbar Keyboard shortcuts button; the control is now under More tools.

## 2. Root-cause repair, independent geometry evidence

The PDF content operator `q 70 0 0 50 402 474 cm /ImSoft Do Q` is in **PDF user space**, while MuPDF `runPageContents` exposes rendered device/image bounds in **page space**. On a normal 612 × 792 PDF, the MuPDF page-to-PDF transform is `[1, 0, 0, -1, 0, 792]`. The PDF source image rectangle `(402,474,70,50)` corresponds to rendered `(402,268,70,50)`, explaining the zero-match failure. PyMuPDF independently confirmed this coordinate relationship.

D19 uses the **inverse actual page transform** (not a hard-coded 792 flip), preserving crop/rotation; rejects missing, invalid, singular transformations; then applies the prior unchanged distinct source/render mask, sibling and moved-destination tests. Native PDF output must still be independently reopened; all four original rendered image instances, the original two attached soft masks and unchanged sibling must be verified. Never treat `/Do` operators without actual rendered evidence as sufficient.

## 3. Published Pages / rollback evidence, with a corrected fail-closed gate

- Repo README production URL: `https://thiepn.github.io/pdf/`.
- D18 read-only Pages CI job [37953680596](https://github.com/thiepn/pdf/actions/runs/37953680596) **reached the actual Pages site** and observed stable version **7.1.4**, build epoch **1790779981000**, service worker SHA-256 `de3e2843df05cc2a4b216a524d4ac0c748ad2b55e74a162825cb8927eac0bfc9` and integrity-manifest SHA-256 `d1ea2dae17ea5fe0d4c56f2046acaded1841d0ef9c1dccde043ff73e6032b5f7`.
- That check returned `internal_asset_checks_passed: false` due **solely to an overbroad placeholder-text check**: the production worker intentionally retains the guard string `__LPS_RELEASE_` to refuse unexpanded assignments. GitHub incorrectly showed the workflow job as successful because `python ... | tee` lacked `set -o pipefail`.
- D19 fixes the placeholder check to reject only actual unresolved assignments and ensures Bash propagates probe failures through `tee`. The new exact-head live probe **must rerun green** before any positive assertion of internal-asset consistency.
- Previously verified annotated stable tag `v7.1.4` object `f697ff30b9bb1974eec3993720f12eb8b060ffe3` points to commit `2116a61b73b6fdb18aa19a8175d9ebae4b43c159`. **Matching displayed version and public hashes is not a cryptographic stable-tag-to-live-asset attestation.**
- Current production main at D18 intake: `6f4f5c1b3b20a0565795879bef77265a4cdea6c0`. Complete ancestry/rollback/historical P17 scope reconciliation before any release.

## 4. Original 18 D8 human-reviewed requirements

The authoritative evidence schema is `docs/design/D8_RELEASE_EVIDENCE.template.json`. **Do not edit it to mark tests passed.** An operator should create a separate candidate-bound evidence copy only after real review.

| D8 exact key | Responsible independent reviewer and evidence to obtain | Status |
| --- | --- | --- |
| `d3_editor_integrated` | Product/QA: mounted editor, real PDF, saved state trace | Pending |
| `d4_selection_history_and_persistence` | Product/QA: selection, undo/redo, reopen persisted project | Pending |
| `d5_real_processor_and_verified_download` | PDF QA: actual output PDF bytes reopened independently | Pending |
| `d6_phone_tablet_runtime` | Device QA: live phone/tablet viewport, reachability and touch | Pending |
| `d7_keyboard_focus_and_status` | A11y QA: keyboard help, focus return, forced colors and announcements | Pending |
| `typecheck_and_verified_build` | Build owner: exact-head source, lockfile, verified artifact SHA | Pending |
| `chromium_real_app` | QA: exact-head real Chromium input/edit/download/reopen trace | Pending |
| `firefox_real_app` | QA: same for Firefox | Pending |
| `webkit_real_app` | QA: same for WebKit/Safari | Pending |
| `pdf_export_reopen_and_fidelity` | PDF engine QA: independent text/image/page/export fidelity | Pending |
| `p17_native_fidelity_qualified` | PDF engine QA: four original paints, two masks, unchanged sibling, moved target | **Blocking** |
| `p18_device_reader_qualified` | Reader QA: real-device zoom/scroll/search/rotation/offline | Pending |
| `security_privacy_review` | Security: source/password isolation, redaction sanitization, local recovery | Pending |
| `dark_light_forced_colors_review` | A11y: light/dark/forced colors visual and contrast acceptance | Pending |
| `keyboard_screen_reader_review` | A11y: actual keyboard/reader, 200% text, focus and announcements | Pending |
| `physical_phone_tablet_review` | Device QA: Android/iOS/tablet actual hardware, touch, rotation, share/reload | Pending |
| `zero_release_blockers` | Release owner: all exact-head workflow/issue blockers fully closed | **Blocking** |
| `rollback_and_deploy_approval` | Release owner: tagged artifact vs live Pages hashes, retained backup and signed approval | Pending |

## 5. Completion criteria / operator handoff

1. Freeze exact D19 candidate SHA after implementation. Re-run all required D19/D18/D17/D16/D15/D14/P17/D7/full-CI/performance/R10 checks **at that SHA**.
2. Independently inspect actual exported PDF file bytes in Chromium, Firefox and WebKit; no non-reopened screenshot or a source `Do` count substitutes for decoded content and masks.
3. Verify D19 read-only live Pages probe; independently compare the approved archived stable release artifact against the served file hashes, registration/scope, service-worker update flow and domain.
4. Gather source-backed evidence for all 18 D8 fields with `source`, substantial `reference`, `reviewed_by`, `status: passed`, bound to the exact reviewed commit. Only an actual reviewer may approve physical devices/screenshots/accessibility.
5. Preserve full source diff review of the P17 → D1–D18 ancestry (previously 731 commits/295 files vs main) and decide promotion/rollback in writing.
6. Explicit independent release-owner approval for **merge** and **deployment**. A D8 `QUALIFIED_FOR_REVIEW` status does not grant publication permission.

**D19 status:** implementation in progress; release not qualified; no merge, tag, production deployment, visual golden replacement or human signoff.

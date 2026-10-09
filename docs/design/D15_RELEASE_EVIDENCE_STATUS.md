# D15 — Regression Closure and Release Evidence Inventory

**Repository:** `thiepn/pdf`  
**Candidate:** draft [D15 PR #148](https://github.com/thiepn/pdf/pull/148), based on draft [D14 PR #147](https://github.com/thiepn/pdf/pull/147). D13 is [PR #145](https://github.com/thiepn/pdf/pull/145).
**Overall release status:** **NOT_QUALIFIED**. No main merge, tagging or production deployment authorized.

## Confirmed P17 native-fidelity defect

D14 commit `7b2b16b8c3c045536ad5454e1118d55a8f1a7bdc` passed source audits, unit tests, typecheck, build, performance and readiness but [P17's Chromium browser export](https://github.com/thiepn/pdf/actions/runs/37935321130) failed. The earlier WebKit path found only **2/4** image paints; the latest path found an unchanged source-image instance missing/moved after the output image count check. Export was safely refused, and **must continue to be refused** until independent reopened-image and mask tests pass.

D15 compares the original masked image graphics-device trace with the independently reopened graphics-device trace, instead of mixing structured-text image rectangles with a device trace. It retains the same minimum image count, unchanged sibling coordinates, selected image destination and attached-mask requirements. If any still fail, output is blocked and exact coordinate evidence is provided. The D15 result is **pending cross-browser verification**, not assumed fixed.

## D8 human/approval evidence: all 18 required, all currently pending

Source: `docs/design/D8_RELEASE_EVIDENCE.template.json`. **Never mark any approved or qualified based solely on CI or screenshots without review.** Each item requires actual source, evidence URL/file reference and a named reviewer. Store final approvals in a separately reviewed release candidate evidence file without editing the source template to pretend qualification.

| ID | Required acceptance / evidence | Reviewer or device required | Status |
| --- | --- | --- | --- |
| d3_editor_integrated | Live editor mounting and real source PDF | Product/QA reviewer | Pending |
| d4_selection_history_and_persistence | Selection, Undo/Redo, persistence recovery on actual file | Product/QA reviewer | Pending |
| d5_real_processor_and_verified_download | Processor input/output, reopened downloaded PDF | Product/QA reviewer | Pending |
| d6_phone_tablet_runtime | Responsive controls and real PDF canvas | Phone/tablet reviewer | Pending |
| d7_keyboard_focus_and_status | Keyboard, focus restoration and announcement behavior | Accessibility reviewer | Pending |
| typecheck_and_verified_build | Exact-head build hash and CI report | Release reviewer | Pending |
| chromium_real_app | Real-PDF export/reading/edited output trace | QA reviewer | Pending |
| firefox_real_app | Same in Firefox | QA reviewer | Pending |
| webkit_real_app | Same in WebKit/Safari | QA reviewer | Pending |
| pdf_export_reopen_and_fidelity | Independent PDF reopen, page/image/text integrity | PDF fidelity reviewer | Pending |
| p17_native_fidelity_qualified | Masked/shared/clipped images, text/vector/table native edits | PDF fidelity reviewer | **Blocked by browser failure** |
| p18_device_reader_qualified | Real-device reader, rotation/zoom, reload/offline | Device reviewer | Pending |
| security_privacy_review | Password isolation, local-only data, safe deletion | Security/privacy reviewer | Pending |
| dark_light_forced_colors_review | Light/dark/forced colors contrast and readability | Accessibility reviewer | Pending |
| keyboard_screen_reader_review | Navigation, actual screen reader, 200% text | Accessibility reviewer | Pending |
| physical_phone_tablet_review | Android/iOS phones and tablet touch/rotation | Physical devices + reviewer | Pending |
| zero_release_blockers | All blocking CI and issue failures closed | Release owner | **Blocked by full regression CI** |
| rollback_and_deploy_approval | Main ancestry reconciliation, backup, rollback, signed approval | Release owner | Pending |

## Automatable checks for D15

- Real application and TypeScript compile; existing unit tests (no test suppression).
- D14 real PDF downloaded-image and sibling-mask verification in Chromium/Firefox/WebKit, including independent MuPDF reopened output.
- Full `PDF Studio CI` browser shards; P17 native-fidelity controls, D13 and D12 integration/visual gates, R10 readiness, consumer-performance gates.
- D8 evidence inventory must continue to report NOT_QUALIFIED while the 18 requirements are pending; it must not fabricate reviewers or references.
- Changed PDF export code must not downgrade fidelity refusal, disabled text/signature protection, deletion sanitization or original-file preservation.

## Production ancestry and rollout blockers

1. D1 is based on feature branch `feature/p17-deep-native-content-fidelity`, **not** directly on `main`; inspect and reconcile upstream/multi-phase commit scope before integration.
2. PRs #145, #147 and #148 remain **draft and stacked**; do not silently squash or merge a leaf PR into production.
3. Independent physical Android/iOS/tablet/device-screen-reader evidence cannot be replaced with desktop browser emulation.
4. A release owner must review the final exact SHA, artifacts, dependency graph, deployment rollback and record approval before promotion.

## Follow-up execution

D16 should remain contingent on a green D15 exact-head qualification, and should focus on release-candidate hardening and controlled deployment preparation. If D15's image export test is red, finish engine correctness first and keep production unchanged.

# D14 — Native PDF Fidelity & Export Reliability

## Scope and stack

- **Base:** D13 draft PR #145 (head at D14 branch cut: `8adbc91071123ee5df4784b099042d82e8739658`).
- **D14:** stacked draft PR #147 targeting `design/d13-integration-release-candidate`.
- **No merge, production deployment, release promotion, or evidence auto-approval.**

## Reproduced problem (pre-D14)

The P17 browser scenario edits a selected soft-masked image whose PDF XObject is also painted elsewhere on the page. The native worker preserved four direct `Do` image operators, including two uses of the original attached `/SMask`, but MuPDF's independently reopened page reported only two rendered/structured images. The existing export gate correctly refused publication with:

`Image edit validation failed ... unrelated image instances disappeared (expected at least 4 painted instances; observed 2)`

This is not a harmless count mismatch: the **rendered/observable fidelity** is authoritative. Do not silence it, allow partial export, or accept direct operator presence as sufficient proof.

## D14 implementation

- `src/workers/native-image.worker.ts`: copy-on-write reconstruction installs a new page-local `/Contents` stream, retaining the source stream object until ordinary garbage-collecting save. It keeps strict guards for stream arrays, content references shared with other pages, unsupported resource names, ambiguous invocation mapping, clipping, complex blending and masks.
- `tests/unit/p17DeepNativeFidelity.test.ts`: generated independent MuPDF round trip verifies four distinct image paints remain, target moves to its expected position, the second invocation stays unchanged, and the previous content is not mutated before save. The old unreferenced stream is **not** expected to survive `garbage=4` cleanup.
- `.github/workflows/d14-native-fidelity-export.yml`: mandatory focused gate runs actual P17 masked-image test and D13 PDF import/download/independent-reopen acceptance across Chromium, Firefox and WebKit. Screenshots/traces are artifacts, **not automatically approved**.

## Qualification evidence

| Gate | Required | Status |
| --- | --- | --- |
| D14 P17 real MuPDF unit | Full pass at exact D14 HEAD | Pending latest rerun |
| TypeScript + build | Full pass at exact D14 HEAD | Pending latest rerun |
| Chromium source-masked image export | 3 P17 scenarios and D13 independent reopen pass | Pending |
| Firefox source-masked image export | Same | Pending |
| WebKit source-masked image export | Same | Pending |
| Full PDF Studio regression CI | Every shard green at release head | **Blocked**: older UI assertions and native exports also failing |
| D8 human evidence / devices | All 18 human items approved with actual evidence | **Pending** |
| P17/P18 broader fidelity qualification | No unresolved document-preservation risks | **Pending** |
| Main ancestry / deployment rollback | Explicit review, approved rollback | **Pending** |

Fail closed: a green P17 unit test alone does **not** qualify the D14 browser engine or V1 release. The current P17 unit regression passed before a TypeScript `addStream` signature error; this call has been corrected to supply an explicit stream dictionary. The exact-head rerun must confirm the correction.

## Remaining diagnosis and acceptance

Review any failed P17 browser traces, particularly when a masked source has a shared XObject resource. If copy-on-write still fails, retain blocked export while investigating MuPDF stream/resource resolution; do not trade integrity for a passing UI. Separate legacy browser tests that still search for the environment-dependent `Download PDF` primary label from actual native-edit export failures. Use the explicit `More save options → Download copy` action for portable download verification.

**Status:** D14 draft implementation, not release-qualified. See [D14 PR #147](https://github.com/thiepn/pdf/pull/147).

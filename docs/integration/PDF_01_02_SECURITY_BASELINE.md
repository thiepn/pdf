# PDF-01/02 draft integration: source provenance and test boundaries

Date: 2026-11-03. This file documents source-level integration, **not** release qualification.

## Authorized scope

- Preserve current main `52166ed4c454db32e52d5260f82479ea289b1462` and published v7.1.4.
- Integrate v7.1.5 reliability fixes from the complete #98 → #104 ancestry without unrelated P/D/F feature stacks.
- Add narrowly scoped PR checks; leave existing manual full CI and production release workflows unchanged.
- PDF-03 native fidelity investigation is read-only. No changes to PDF writers, image matching, fidelity guards, fixtures, migration formats, deployments, or production data.
- Draft PR only. Do not merge, tag, publish or deploy.

## Source reconciliation

Parent: `52166ed4c454db32e52d5260f82479ea289b1462`.

Upstream patch head: [PR #104](https://github.com/thiepn/pdf/pull/104), commit `1b0ac2638a8238a2cfcc43b43b9880871e6293c9`.
The seven upstream PRs are #98, #99, #100, #101, #102, #103, #104.
The common ancestor is `6f4f5c1b3b20a0565795879bef77265a4cdea6c0`.

The two newer main commits changed only `.github/workflows/ci.yml`, `.github/workflows/consumer-performance.yml`, and `AGENTS.md`. The 14 ported paths have no overlap with those main changes, so they are copied at their exact upstream blob identities rather than manually reconstructed.

| PR | Behavior | Source or tests |
| --- | --- | --- |
| #98 | Recover/retry OCR cache migration; delete old cache only after copies | `languagePackManager.ts`, OCR migration tests |
| #99 | Prevent duplicate share-inbox import when Cache Storage deletion fails, without capping tombstones at 100 | `shareInbox.ts`, Home, consumption tests |
| #100 | Use credential identities instead of raw password-bearing PDF.js cache keys | `pdfjs.ts`, shared-session tests |
| #101 | Forget a deleted project's in-memory password only after successful persistent removal | `projectRepository.ts`, `sessionPasswords.ts`, tests |
| #102 | Expire abandoned memory-only file/password task handoffs on TTL | `fileHandoff.ts`, task-first tests |
| #103 | Scrub previously persisted user/owner password fields on read and rewrite | `securityRepository.ts`, privacy tests |
| #104 | Register in-session passwords after successful project creation and reused project imports | `projectRepository.ts`, session tests |

No project-package, IDB, or native-editor schema version changes.

## Integration smoke workflow

`.github/workflows/integration-pr-smoke.yml` runs on relevant pull requests to `main`:
- TypeScript, all unit tests, source audit, security/privacy and migration audits.
- Genuine Chromium privacy test and stored-document → Quick task → downloaded PDF → independent MuPDF reopen.
- Failure screenshots/traces are retained; no write permissions, production secrets, deploy jobs, or publication steps.

This is **additional cheap coverage**, not a replacement for `.github/workflows/ci.yml`, cross-browser qualification, field tests, or human acceptance. The workflow checks out and asserts the exact PR branch head SHA. A future merge candidate and its base must be independently reverified before any later merge decision. No test outcome is pre-claimed.

## PDF-03: known failures retained without edits

[D19 #152](https://github.com/thiepn/pdf/pull/152) head `49b09e279291e6bfeb257f8c7fb835a750efd1e8`.
Its recorded browser failures include P17 masked-image source selection and D14 independent PDF export. The inspected source projects PDF content-stream coordinates through the inverse actual MuPDF page transform; nevertheless browser evidence reports a soft-masked image as fidelity-protected because unambiguous source-to-rendered invocation matching could not be proven. Do not mistake the safety refusal for proven corrupted bytes.

Next isolated diagnosis (outside this PR): examine per-invocation resource identity, graphics-device bounding boxes, clipping/blend state, unique matching, and independent reopened outputs for the fixture's four image instances and two masks. Preserve the negative cases. D19 also has mobile/tablet 44-pixel target and viewport failures. These remain out of this draft integration.

## Release boundary

All original human/device/external-reader requirements remain unmet where not specifically measured. This PR is **draft**, cannot be used as production release evidence, and must not advance existing P18/D19/F-series release approvals.

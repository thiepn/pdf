# P9 — v7.1.4 Release Candidate Certification

P9 is the final phase of the current task-first product-hardening roadmap. It is a **release freeze, certification, packaging, deployment-verification, and defect-only phase**. It introduces no new PDF editing primitive.

## Release identity

- Product: PDF Studio
- Candidate version: `7.1.4`
- Source/default channel: `release-candidate`
- Stable tag: exact future `v7.1.4`
- Stable tag must be reachable from `main`
- Project package: v9
- Database schema: v13
- Native editor state schema: v6
- Release manifest: `docs/p9/release-freeze.json`

A green check on an older commit is not release evidence for a newer commit.

## Current P1–P8 product stack

P9 certifies the actual product-hardening roadmap completed immediately before this phase:

1. **P1 — Existing-Content Editing Excellence**  
   Existing text editing, find/replace, fit/reflow safety, style/background/span preservation, imported-font preflight, original-vs-edited comparison, and synchronized history.

2. **P2 — Intelligent Document Entry**  
   Deterministic local document evidence selects 2–4 useful existing tasks without adding an AI/chat layer or blocking document opening.

3. **P3 — OCR 2.0 / Scan-to-Editable**  
   Source-preserving OCR evidence, correction/review, region OCR, invisible searchable text layers, and Continue in Edit without replacing the original page artwork.

4. **P4 — Native File Workflow**  
   Progressive native Open / Save / Save As, explicit Replace original, linked-file conflict checks, download fallback, and external `.lpsproject` backups without changing the main DB/package formats.

5. **P5 — Trust & Output Verification**  
   Shared post-operation verification evidence, measured preservation/change results, honest sampled checks, and explicit lossy-operation consequences.

6. **P6 — Mobile Interaction Excellence**  
   Live VisualViewport handling, keyboard-safe sheets, minimum touch targets, and touch-complete page reordering without requiring desktop drag-and-drop.

7. **P7 — Forms & Redaction Excellence**  
   Reviewed interactive text/checkbox field creation plus local sensitive-text discovery that only becomes permanent through the existing validated redaction writer.

8. **P8 — Fidelity & Compatibility**  
   Mandatory source/output fidelity gates before publication, exact intent-aware structural expectations, bounded untouched-page semantic checking, and independent external-reader compatibility validation.

The older v7 universal-editing engine regressions remain frozen underneath this product layer and continue to run. P9 does not remove historical release protection simply because the current product roadmap has different phase names.

## Exact-head certification gates

An RC is acceptable only when all required checks are green on the exact candidate head:

- P9 release-freeze source audit.
- Current P1–P8 phase manifest/source contract.
- Historical Phase 11–30 runtime/migration/security gates.
- v6.0.1–v6.1.0 maintenance regressions.
- frozen v7 universal-editing runtime regression.
- P8 compatibility corpus opened independently by PyMuPDF and pypdf.
- exact lockfile, toolchain, dependency-tree, source, Pages and moderate-or-higher npm security audits.
- TypeScript + complete unit suite.
- verified production distribution audit.
- repeat-build distribution fingerprint identity.
- browser regression against the exact verified artifact.
- Chromium, Firefox, WebKit, phone Chromium, and tablet WebKit coverage for both release-candidate and stable channels through Release completion verification.
- deterministic application/upstream licence bundle and offline licence availability.
- no unexplained failures, flakiness, expected failures, missing reports, or administrative bypasses.

The read-only **Release completion verification** workflow is the canonical pre-publication certificate. Its `v7.1.4-release-certificate` artifact identifies the exact source SHA, channel/browser matrix and actual execution counts.

## Packaging contract

The Stable workflow must package and checksum:

- source ZIP;
- source tar.gz;
- exact browser-qualified distribution ZIP;
- ordinary/adversarial/P8 compatibility corpus reports;
- P9 qualification contract;
- P9 release-freeze manifest;
- curated v7.1.4 release notes;
- release metadata;
- release integrity manifest;
- licence inventory;
- SHA-256 manifest covering the published release assets.

The GitHub Release body comes from the curated v7.1.4 release notes, not automatically generated commit prose.

## Candidate publication

Merging an RC PR does **not** make it Stable.

The main-branch Pages workflow:

1. checks whether the same-version Stable tag already exists;
2. if not, requalifies the merged commit;
3. reproducibly builds `release-candidate`;
4. browser-tests that exact distribution;
5. deploys only the qualified artifact;
6. verifies version/channel/integrity/offline assets after deployment.

If `v7.1.4` already exists, candidate deployment for the same version is deliberately suppressed so a Stable site cannot be overwritten by a candidate.

## Stable promotion

Stable publication requires the exact immutable `v7.1.4` tag on a commit reachable from `main`.

The Stable workflow must then independently:

1. verify tag identity and main ancestry;
2. install the exact committed dependency graph;
3. prepare and independently validate all release corpora;
4. rerun P9 and the full frozen web gate;
5. reproducibly rebuild the stable distribution;
6. browser-qualify the exact stable artifact;
7. verify `release-metadata.json` reports `7.1.4` + `stable`;
8. run dependency security qualification;
9. create deterministic release assets/checksums;
10. deploy the already-qualified artifact;
11. smoke-test the deployed PWA/version/channel/integrity identity;
12. only then publish the GitHub Release.

A PR merge, a Pages deployment, a tag and a published Stable GitHub Release are distinct states.

## Defect-only rule

After entering P9:

- no new editing primitives;
- no speculative feature expansion;
- no persistent format bump unless a release-critical defect makes it unavoidable and the release freeze is intentionally reopened;
- fixes must protect data integrity, compatibility, privacy/security, deployment/recovery, or a reproduced usability/release defect;
- failed assertions are fixed at their cause rather than weakened to obtain a green badge.

## Human/device boundary

Automated Playwright phone/tablet profiles are not physical-device or human usability certification. Human/real-device evidence may be recorded when genuinely performed; P9 must not fabricate it.

## Definition of Done

`V7_1_4_RC_CERTIFIED` may be declared only after the exact P9 head passes every required candidate CI job and Release completion verification produces a valid `v7.1.4-release-certificate`.

Stable may be declared only after the exact `v7.1.4` tagged workflow independently qualifies, deploys, smoke-tests and publishes successfully.

## What comes after P9

There is **no P10 in this roadmap**. After P9:

1. merge the exact qualified RC to `main`;
2. verify the merged commit/candidate deployment;
3. create `v7.1.4` only when the release decision is made;
4. let the Stable workflow requalify and publish;
5. any later product work starts a new roadmap/version rather than extending P9.

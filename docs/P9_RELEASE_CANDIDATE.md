# P9 — v7.0.0 Release Candidate

P9 is the final phase of the Universal Editing roadmap. It is a release freeze and certification phase, not a feature-expansion phase.

## Release identity

- Product: PDF Studio
- Candidate version: `7.0.0`
- Source/default channel: `release-candidate`
- Stable channel: exact future `v7.0.0` tag only
- Stable tag must be reachable from `main`
- Project package format: v9 (unchanged)
- Database schema: v13 (unchanged)
- Native editor state schema: v6 (unchanged from the P7/P8 qualified stack)

## Frozen P1–P8 capability stack

1. **P1 — Existing text foundation**: deterministic direct text editing for supported source text.
2. **P2 — Layout-aware reflow & font fidelity**: paragraph reconstruction, fit evidence, preserved style runs, and deterministic downstream movement where supported.
3. **P3 — Existing images**: source image move/resize/fit/crop/opacity/rotation/replacement/deletion through a qualified image writer.
4. **P4 — Existing vectors**: exact supported path identity, geometry/paint/stroke/dash/alpha transforms, and deletion without broad page flattening.
5. **P5 — Structured tables**: detected cell-grid editing, merge/rebuild, row/column geometry, and safe whole-table transforms.
6. **P6 — Unified object layout**: mixed added/native selection, move, resize, alignment, distribution, matching, nudging, and rotation through the correct underlying writer.
7. **P7 — Complex/nested PDF content**: reusable Form XObject instances are first-class nested groups that can be transformed/deleted independently without flattening their shared source.
8. **P8 — Fidelity & compatibility**: source/output structural and sampled semantic certification plus a nine-class external-reader compatibility corpus.

## P9 hard gates

A v7 RC is acceptable only when all of the following are green on the exact candidate head:

- P9 release-candidate source audit (`RC_FREEZE_PASS`).
- Historical Phase 11–30 stability/runtime/migration/security gates.
- Historical v6.0.1–v6.1.0 maintenance regressions, widened only so they continue to protect v7 without forcing a v6 version number.
- Dedicated v7.0.0 universal-editing runtime regression.
- P8 compatibility corpus independently opened by PyMuPDF and pypdf.
- Source audit, Pages readiness, dependency policy, lockfile/toolchain/tree audits, and high-severity npm security gate.
- TypeScript qualification and complete unit suite.
- Verified production build and distribution audit.
- Same-commit reproducibility fingerprint comparison.
- Playwright regression against the exact verified distribution, including Chromium, Firefox, WebKit, mobile Chromium, and tablet WebKit projects already defined by the repository.
- P1–P8 browser regressions, including the mixed P6 overlay/native export path and P8 rotated/cropped + incremental-revision editor exports.

## Publication contract

Merging the P9 PR into the integration branch does **not** publish Stable. The release candidate may later be promoted by merging the accepted integration state into `main`, where the candidate Pages workflow rebuilds and requalifies it with `VITE_RELEASE_CHANNEL=release-candidate`.

Stable publication requires an exact `v7.0.0` tag on a commit reachable from `main`. The Stable workflow must then independently:

1. verify exact tag identity and main-history ancestry;
2. install the committed exact dependency graph;
3. rerun P9 plus the frozen full release gate;
4. reproducibly rebuild the distribution;
5. browser-qualify that exact artifact;
6. verify `release-metadata.json` says `7.0.0` + `stable`;
7. deploy that already-qualified artifact;
8. smoke-test the deployed application/PWA identity;
9. only then publish the GitHub Release and checksums.

## Non-goals / retained boundaries

P9 does not claim universal Word-like editing of arbitrary PDFs. Unsupported or ambiguous source constructs must remain preserved, explicitly capability-limited, or fail closed. Rasterizing workflows keep their existing explicit interactive-structure loss boundary. Browser-only certificate signing and certified standards conversion remain outside the v7 claim.

## Definition of Done

`V7_RC_CERTIFIED` may be declared only after the exact P9 head passes every required CI job with no unresolved release-critical regression. Until then the PR remains Draft.

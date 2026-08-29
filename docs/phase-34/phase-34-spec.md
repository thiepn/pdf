# Phase 34 Specification — Stable Pages Deployment Governance

## Goal

Keep GitHub Pages trustworthy after a Stable release has been tagged. Main-line development must continue to receive normal CI qualification without turning every post-release commit red or overwriting the published Stable site with an unreleased build of the same version.

## Invariants

1. **Stable Pages is immutable by version** — if `v<package.json version>` already exists, a main push does not replace Pages.
2. **Policy skip is not a failure** — preserving an existing Stable deployment is a successful policy decision, not a broken deployment.
3. **CI remains independent** — source, browser, performance, and operational-readiness workflows continue to qualify main-line work even when Pages deployment is skipped.
4. **New versions can deploy candidates** — when the package version has no matching Stable tag, the verified release-candidate deployment path remains enabled.
5. **Exact artifact qualification remains mandatory** — candidate builds still pass reproducibility, browser, security, corpus, and PWA gates before Pages is changed.
6. **Smoke checks are version-derived** — deployment smoke reads the expected version from the policy job instead of embedding `7.0.0`.
7. **No Stable overwrite escape hatch** — manual workflow dispatch follows the same version/tag policy.

## Result

After P34, post-Stable development on `main` can proceed without an expected red deployment workflow. The existing Stable site remains untouched until the repository advances to a version without a Stable tag, at which point the full release-candidate deployment sequence becomes eligible again.

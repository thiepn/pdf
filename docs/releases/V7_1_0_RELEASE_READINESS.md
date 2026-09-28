# v7.1.0 release readiness and publication

## Release scope

v7.1.0 delivers the task-first PDF tools, tab-free document editor, validated current-document handoff, mixed PDF/image page assembly, visual cropping, and repaired reader navigation and fitting. Existing local project, database, backup, and native-editor formats are unchanged. The complete release branch includes the prerequisite everyday-workflow engine fixes; those changes must not be left behind when integrating the redesign.

This document describes the release contract, not an assertion that a particular commit passed. The generated certificate and GitHub Actions results identify the exact qualified commit. A newer commit must be qualified again.

## Required evidence

The read-only **Release completion verification** workflow builds both `release-candidate` and `stable` channels without deploying either. Each build must pass the full `release:web` gate, independent PDF corpus validation, dependency audits, and byte-identical rebuild checks. Both channels are then exercised in Chromium, Firefox, WebKit, phone Chromium, and tablet WebKit profiles against their exact built distributions.

The `certify` job emits `v7.1.0-release-certificate` only after all preparation and browser jobs succeed. Its `release-certificate.json` contains the source SHA, version, run ID, per-browser/channel execution counts, and explicit skip reasons. It rejects missing reports, failures, expected-failure tests, flaky outcomes, retries, count mismatches, unexplained skips, and disabled external-corpus coverage. Capability-specific skips remain visible and are not counted as passing tests.

Additional artifacts retain the source archive, distribution fingerprint, lockfile checksum, complete/production-only npm audit reports, browser reports, and failure traces. Normal PR CI, performance-budget checks, and operational-policy checks must also succeed. Keep the certificate with the release records rather than relying on a screenshot of green checks.

## Security and deployment hardening

- Vitest is pinned to `4.1.11` to resolve GHSA-82fw-gwwq-j7x9 in the test tooling. Production dependency records must remain unchanged by this test-only patch. The regular npm security gate rejects moderate-or-higher findings, and release-completion evidence currently requires clean full and production-only audit reports.
- Candidate and stable publication use one `pages` concurrency group without cancelling an active publication. Candidate deployment is restricted to `main`; a candidate cannot overwrite an existing stable tag at the same version.
- Candidate, stable, and dry-run verification share `scripts/releases/prepare-browser-corpora.mjs`. This prepares and independently validates ordinary, adversarial, compatibility, stress, and real-world external fixtures before browser qualification. Missing corpus data is a failure, not silently reduced coverage.
- Publishing workflows run browser tests with zero retries. Stable publication retains exact-tag checking, main-history provenance, reproducible builds, explicit stable metadata checks, and post-deployment smoke verification before creating the GitHub Release.

The development-tool advisory does not establish compromise of the shipped app. Audit output is time-sensitive: preserve the dated reports and recheck before publication.

## Publication procedure

1. Verify that the release PR targets `main`, includes the prerequisite engine fixes, has no unresolved review blockers, and has a passing certificate for its current head. Do not replace checks with an administrative bypass.
2. Merge the qualified release PR using the normal repository process. Verify the resulting `main` commit passes CI. The main-branch Pages workflow may publish a separately qualified release-candidate build while no `v7.1.0` tag exists.
3. Create the new immutable `v7.1.0` tag on the reviewed commit reachable from `main`. Do not move or recreate the existing `v7.0.0` tag. A squash or merge commit is a different SHA from the PR head, so the tagged workflow must requalify the resulting source.
4. Require **Publish qualified v7.1.0 stable release** to complete qualification, deploy the exact artifact, and pass its deployed shell, manifest, service-worker, version/channel, integrity, and offline-asset smoke checks. Only then is v7.1.0 published as stable.
5. Retain the release archives and SHA-256 checksums. Confirm a fresh browser opens a PDF and an existing installation can update while retaining its local projects. Do not clear browser storage as an update workaround.

A merge, a tag, an uploaded Pages artifact, and a published stable release are distinct states. Report the state actually reached.

## Supported limits

PDF-to-Word exports editable extracted text and page breaks, not original-layout Office reconstruction. Word/Excel/PowerPoint input conversion, arbitrary document-level structure preservation, unrestricted editing of every PDF, formal standards certification, and trusted certificate-backed signing are not claimed. Cropping is not secure erasure; only the permanent-redaction workflow is intended for that purpose. Rewritten documents do not preserve the validity of previous digital signatures.

Automated touch profiles are not physical-device or human usability certification. Any release gate requiring real-user evidence must use actual evidence rather than fabricated approvals. Existing project backups remain important because browser-local storage is not a remote backup service.

## Recovery

If qualification fails, fix the source or test defect and rerun against the new exact commit. Never remove data-integrity assertions just to obtain a passing badge. If the published release has a defect, preserve user documents and publish a reviewed forward patch with a new version. Avoid silently serving an older application against newer local data; the existing future-schema refusal remains mandatory. Service-worker cache maintenance must stay limited to this deployment and must not delete pending shared files or local projects.

## References

- Maintainer advisory: https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9
- Publication: `.github/workflows/release.yml` and `.github/workflows/deploy.yml`
- Pre-publication verification: `.github/workflows/release-completion.yml`
- Certificate validation: `scripts/releases/certify-browser-matrix.mjs`
- Product limits: `KNOWN_LIMITATIONS.md`, `SECURITY.md`, and `PRIVACY.md`

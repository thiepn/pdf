# P10 — Stable Release Promotion & Post-Release Verification

P10 is a release-operations extension created after the P9 release-candidate freeze. It does **not** add product features and it does not weaken or replace P9.

## Objective

Turn a fully certified P9 release candidate into Stable without relying on memory, manual tag typing, or an unverifiable assumption that a green PR was the commit actually promoted.

P10 adds:

1. an exact-certificate promotion gate;
2. an explicit human promotion action;
3. immutable-tag creation only after all promotion prerequisites are proven;
4. post-release verification of published assets and the deployed Stable identity.

## Relationship to P9

P9 remains the source/product freeze and produces the canonical `v7.1.4-release-certificate`.

P10 may not promote anything until:

- P9 Release completion succeeded;
- the certificate belongs to the exact candidate SHA;
- all ten Stable/RC browser cells are present and clean;
- the P9 freeze manifest and curated release notes still hash to the values in that certificate;
- the candidate SHA is already reachable from `main`;
- `v7.1.4` does not already exist.

P10 never edits P9's certificate and never converts a failed/queued P9 run into promotion evidence.

## Promotion workflow

`.github/workflows/promote-stable.yml` is manual by design.

The operator supplies:

- the exact certified candidate SHA;
- the literal confirmation `PROMOTE v7.1.4`.

The workflow then:

1. checks out `main` with complete history;
2. validates the explicit confirmation and candidate SHA syntax;
3. fetches the candidate and proves it is an ancestor of `origin/main`;
4. refuses promotion if `v7.1.4` already exists locally or remotely;
5. locates a **successful** Release completion run whose `head_sha` is exactly the candidate SHA;
6. locates that run's unexpired `v7.1.4-release-certificate` artifact;
7. downloads the certificate;
8. checks out the exact candidate commit;
9. cryptographically re-hashes the P9 freeze and curated release notes;
10. validates certificate identity, schema versions, ten-cell browser matrix, zero failures, zero retries, and zero flaky results;
11. verifies the certificate against a detached worktree of the exact candidate while keeping the P10 verifier available from the promotion controller;
12. requires repository secret `STABLE_PROMOTION_TOKEN` for the tag push;
13. creates an annotated `v7.1.4` tag pointing to the certified commit;
14. pushes only that tag with the dedicated promotion credential.

The existing tag-triggered Stable workflow then independently requalifies, rebuilds, browser-tests, deploys, smoke-tests and publishes. P10 does not bypass that second qualification.

The dedicated promotion token is required because GitHub suppresses workflow-triggering events created by the default Actions `GITHUB_TOKEN`. `STABLE_PROMOTION_TOKEN` must therefore be a dedicated GitHub credential allowed to create the Stable tag and trigger the tag-push workflow. It should be scoped only as broadly as needed for this repository.

## Post-release verification

`.github/workflows/post-release-verification.yml` runs when the GitHub Release is published.

It verifies:

- exact tag `v7.1.4`;
- required release assets are present;
- the published SHA-256 manifest validates every packaged `pdf-studio-*` asset it covers;
- the release-freeze, metadata, integrity and licence evidence are present;
- deployed Pages returns PDF Studio;
- deployed `release-metadata.json` reports version `7.1.4` and channel `stable`;
- deployed integrity/offline manifests are reachable.

It emits `v7.1.4-post-release-certificate` as durable post-publication evidence.

## Safety rules

- P10 does not automatically merge P9 or P10.
- P10 does not create a tag unless a human explicitly triggers promotion and types the exact confirmation.
- P10 cannot promote a candidate that is not in `main`.
- P10 cannot promote from a merely green unit/build run; the exact P9 browser certificate is mandatory.
- P10 cannot replace an existing Stable tag.
- P10 never uses the default `GITHUB_TOKEN` to push the Stable tag.
- The certified P9 SHA must remain an ancestor of `main`; squash/rebase merging that discards the certified commit identity is intentionally rejected.
- Stable publishing still remains downstream of the independent tag workflow and deployed smoke check.
- No database, package, native-editor, PDF, OCR, form, redaction or editor format changes are allowed in P10.

## Definition of Done

P10 implementation is complete when:

1. promotion certificate verification is unit tested and fail closed;
2. manual promotion workflow requires exact SHA + explicit confirmation;
3. promotion requires exact successful P9 Release completion evidence;
4. tag creation is ancestor-gated and collision-safe;
5. post-release verification validates both published assets and deployed Stable identity;
6. P9 and existing Stable qualification remain intact;
7. CI passes on the P10 branch.

Operational P10 completion for v7.1.4 occurs only after the real P9 candidate is certified, promoted, independently published by the Stable workflow, and the post-release certificate is green.

## What's next

After a successful v7.1.4 P10 promotion there is no further release phase for this version. Subsequent product development should start a new roadmap/version.

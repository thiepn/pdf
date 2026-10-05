# P11 — v7.2 Development-Line Foundation & Release-Line Separation

P11 starts a new roadmap after the v7.1.4 P9/P10 release line. It is deliberately **pre-cut**: the repository still identifies as v7.1.4 until the real v7.1.4 Stable release has completed P10 post-release verification.

## Objective

Create a clean development boundary for v7.2 without mutating, reusing, or weakening the frozen v7.1.4 release contract.

P11 establishes:

- target next version `7.2.0`;
- explicit current Stable lineage `7.1.4`;
- a machine-readable next-line manifest;
- atomic version-cut requirements;
- a hard prerequisite on the real `v7.1.4-post-release-certificate`;
- frozen persistence-schema expectations;
- dedicated P11 CI/audit coverage.

## Why the version is not bumped yet

The P9/P10 line is still responsible for certifying and publishing v7.1.4.

Bumping `package.json`, `package-lock.json`, or `APP_VERSION` to 7.2.0 before the actual Stable/post-release certificate exists would make the source tree ambiguous:

- P9/P10 evidence would refer to 7.1.4;
- runtime/package metadata would refer to 7.2.0;
- same-version Stable-preservation logic could no longer be reasoned about cleanly.

P11 therefore records `7.2.0` as the **next release target**, but keeps the executable source identity at `7.1.4` until the cut gate is explicitly satisfied.

## Version-cut prerequisite

The v7.2 version cut must not happen until the actual P10 post-release artifact proves:

- status `P10_POST_RELEASE_PASS`;
- version `7.1.4`;
- tag `v7.1.4`;
- exact published release SHA;
- published GitHub Release identity;
- deployed Stable URL evidence.

The cut is intentionally blocked if that evidence is missing, malformed, or for a different version/tag.

## Atomic version cut

When v7.2 is eventually activated, these identities must move together in one reviewed change:

- `package.json` version → `7.2.0`;
- root package version in `package-lock.json` → `7.2.0`;
- `src/core/release.ts` `APP_VERSION` → `7.2.0`;
- next-release manifest state → active;
- new v7.2 release notes/roadmap contract;
- next-line release qualification configuration.

A partial version cut is invalid.

## Frozen format boundary

P11 does not change:

- `.lpsproject` package version: **9**;
- IndexedDB schema: **13**;
- native editor schema: **6**.

A future v7.2 phase may intentionally change one of these only with migration/backward-compatibility evidence and a corresponding release-contract update.

## Stable-line preservation

The following v7.1.4 controls remain historical/frozen release evidence and must not be repurposed as v7.2 controls:

- P9 release-candidate freeze;
- P10 promotion certificate verification;
- exact `v7.1.4` Stable tag workflow;
- exact `v7.1.4` post-release certificate.

v7.2 gets its own release contract later rather than changing the meaning of v7.1.4 evidence.

## Development rule

New product features after P11 belong to the v7.2 roadmap. P11 itself is only the boundary/foundation phase.

## Definition of Done

P11 is complete when:

1. the v7.2 next-line manifest exists and is machine-checked;
2. current executable version identity remains atomically v7.1.4 while status is `pre-cut`;
3. target next version is exactly v7.2.0;
4. P9/P10 v7.1.4 controls remain pinned to v7.1.4;
5. persistent format versions remain 9 / 13 / 6;
6. version-cut readiness can be verified from a real P10 post-release certificate;
7. dedicated P11 CI/audit coverage is green.

## What's next

**P12 — v7.2 Product Roadmap & Feature Intake**

P12 should decide what actually belongs in v7.2: product gaps, UX priorities, compatibility work, and feature scope. It should not perform the Stable v7.1.4 promotion itself; that remains P10 operational work.

# D16 — Main ancestry reconciliation, release protection and rollback approval

**Status: REVIEW BLOCKED.** This document prepares an eventual release review; it does not approve or schedule a deployment. D13 [#145](https://github.com/thiepn/pdf/pull/145), D14 [#147](https://github.com/thiepn/pdf/pull/147), and D15 [#148](https://github.com/thiepn/pdf/pull/148) are separate draft PRs. D16 is stacked on D15. Do not merge, retarget directly to main, create a new stable tag or deploy.

## Actual production mechanism

The repository's current deployment is **GitHub Pages**, not an assumed Vercel pipeline. `.github/workflows/deploy.yml` executes on **push to `main`** and on dispatch, with a Pages deployment-policy job: for a package version already tagged `v<version>`, the workflow preserves Stable Pages and skips a redundant same-version candidate deployment. Current package version is **7.1.4**, and `.github/workflows/release.yml` publishes the exact `v7.1.4` stable tag after its own full qualification. **Do not rely on the same-version guard as authorization to merge.** New version/tag changes can trigger actual publication and browser cache updates.

GitHub Pages and the service worker can remain pointed at a previously qualified artifact despite a newer branch HEAD. The verified production commit, published asset hashes and PWA manifest must be separately inspected as part of any release.

## Main branch and source provenance

| Baseline | Immutable reference | Meaning |
| --- | --- | --- |
| Observed production `main` | `6f4f5c1b3b20a0565795879bef77265a4cdea6c0` | Must be rechecked immediately before any promotion |
| Published stable `v7.1.4` | `2116a61b73b6fdb18aa19a8175d9ebae4b43c159` (annotated tag `f697ff30b9bb1974eec3993720f12eb8b060ffe3`) | Verified GitHub release published 1 October 2026; potential rollback source only, not proof of current live Pages asset |
| D1 inherited P17 foundation | `dd23b3c2a0563de7c429fe42738f0d5d748e478e` | D1 was based on P17, not directly on main |
| D13 draft | `8adbc91071123ee5df4784b099042d82e8739658` | Main redesign integration + P17 inherited scope |
| D14 draft | `7b2b16b8c3c045536ad5454e1118d55a8f1a7bdc` | Soft-mask copy-on-write, still unqualified |
| D15 draft | `68e285281507358ede15ed5c07a0dd7548c0ea2a` | Coordinate evidence consistency, release inventory |
| D16 draft | Live PR HEAD only | Qualification must run on the final commit, not a prior run |

GitHub comparison of the D15 head to observed production main on 9 October 2026: **731 commits ahead, 0 behind, 295 changed files**. This means the main-ancestry relationship is a superset rather than a routine redesign cherry-pick. The GitHub comparison response included at most a bounded commit list; the complete source diff and change ownership still require a full, explicit reviewer audit.

## Mandatory release acceptance

1. **P17 native-content correctness** — Independently reopen a real transformed PDF in MuPDF and inspect all four rendered image instances, both original attached soft masks, unchanged sibling coordinates, edited image location and page count. Real browser qualification is mandatory in Chromium, Firefox and WebKit. If any fails, the engine must **refuse export**; counting `/Do` operators without rendered image evidence is insufficient.
2. **Broader native/editor and quick-tool regressions** — Existing full PDF Studio CI plus D12/D13 visual/integration, D14/D15, P17, performance, R10, source + security and P18 device/reader acceptance. Failed tests cannot be waived, skipped, retried into approval or replaced with unit-only evidence.
3. **D8 real human evidence** — All 18 requirements in `docs/design/D8_RELEASE_EVIDENCE.template.json` remain pending. A reviewer must record a permitted source type, substantial evidence reference, their name and the exact candidate SHA. Existing D8 validation marks full inventory at most `QUALIFIED_FOR_REVIEW`, **not permission to deploy**.
4. **Physical hardware acceptance** — Phone, tablet, Android/iOS browser behavior, actual keyboard and screen reader, 200% typography, forced colors, dark/light, touch input, offline/PWA update and data recovery. Emulated browsers are not a substitute.
5. **Release/rollback authorization** — Independent release owner reviews the root P17 dependency, entire 295+ file diff, exact finished artifact and checks, release version/tag intent, protected branch, operational environment, backup and rollback. No publishing without their explicit approval.

## Controlled promotion runbook (not authorized yet)

- **Freeze:** Obtain the actual current main SHA and stable published artifact SHA/hash. Stop changing the candidate. Protect full CI, D8 and required review rules; do not retarget or merge an unqualified stacked leaf PR.
- **Review sequence:** Reconcile the D1/P17 foundation and merge dependencies through D13, D14, D15, D16 in reviewed order only if each base is explicitly approved. Re-run at each resulting exact head. No forced merge, history rewrite, or blind automation.
- **Artifact qualification:** Confirm deterministic `npm ci`, `npm run build:verified`, `npm run test:e2e`, the version-specific release integrity metadata, GitHub Pages publication policy, and an independent external-reader/PWA validation.
- **Approval:** Record reviewer name, timestamp, exact SHA, source evidence URLs, version, `v7.1.4` stable asset hash (or newer intentionally approved version) and a verified rollback target. The reviewer authorizes the specific merge and later deployment separately.
- **Promotion:** Only after those gates pass, use the repository's existing protected workflows; ensure the correct Pages environment has deployment restrictions and matching release channel. Do not create a stable tag or dispatch a workflow simply to test a draft candidate in production.
- **Post-release smoke:** Independently check Pages URL, `manifest.webmanifest`, `sw.js`, `release-metadata.json`, `release-integrity.json`, main/tag SHA, cache update behavior and real editable/downloaded PDF output across target browsers.
- **Rollback if damaged:** Halt new promotion, identify the previously approved immutable stable tag/artifact, verify its SHA and deployment hash, and restore via the authorized Pages release/deployment procedure. A git revert alone does **not** prove Pages or installed PWAs reverted. Recheck the exact URL, cache/service worker, hashes and API-free local source recovery before declaring recovery. Do not delete users' local projects or silently invalidate persisted offline files.

## Current decision

- **Native fidelity:** blocked; D14's latest completed exact-head P17 browser test failed on untouched-image preservation.
- **D15 exact-head:** queued at last observation. D16 cannot infer a pass.
- **D8 approvals:** 0 of 18 in the original template.
- **GitHub Pages promotion:** prohibited. Main/stable production unchanged.

The D16 script and workflow are **preparation audits only**, designed to catch wrong main baselines, missing ancestry and fabricated approvals while refusing production promotion.

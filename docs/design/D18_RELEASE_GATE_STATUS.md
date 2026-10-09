# D18 — Browser Fidelity Remediation & Release-Gate Status

**Repository:** `thiepn/pdf`  
**PR:** [D18 draft #151](https://github.com/thiepn/pdf/pull/151), stacked on D17 #150 → D16 #149 → D15 #148 → D14 #147 → D13 #145.  
**State:** `NOT_QUALIFIED`. Never merge, tag, approve baselines or deploy while the gates below are incomplete.

## Exact-head D17 intake, 9 October 2026

D17 PR #150 was verified at `7cb8983a1a5a599ca3837b801e13fab1b92b27a1`. Its eight separate P17/D14/D15/D16/D17/full-CI/performance/R10 workflows were **queued or pending** at intake; therefore **no D17 exact-head green browser evidence existed** to authorize release.

Last completed relevant tests:
- [D15 P17 Chromium 37937196068](https://github.com/thiepn/pdf/actions/runs/37937196068): **failed** with `Masked image transform did not preserve its attached soft mask on page 1`; no unsafe PDF was downloaded.
- [D15 WebKit 37937196049](https://github.com/thiepn/pdf/actions/runs/37937196049): **failed** P17/D14 real exported PDF scenarios; this was not merely a Playwright timing issue.
- [D16 source qualification 37940441719](https://github.com/thiepn/pdf/actions/runs/37940441719): ancestry/source tests **passed**, but did not qualify export or browser tests.
- [D13 full CI 37922133251](https://github.com/thiepn/pdf/actions/runs/37922133251): failed across eight browser shards. Browser failures need root-cause-specific diagnosis on current exact head; historical counts cannot be represented as independent or current defects without confirmation.

## D18 implemented, still requiring browser proof

1. **Masked source identity, independent of enumeration order** — `src/native/nativeImageEvidence.ts` and `src/workers/native-image.worker.ts`: match original qualified `/SMask` XObjects to **unique real graphics-device rendered images** using exact bounding geometry regardless of MuPDF structured-text count and order. No masked source may be qualified from the order of `Do` operators alone. Reject overlapping matches, unpainted sources, clipping, non-Normal blend, explicit masking and unsupported image states.
2. **Real native MuPDF regression** — `tests/unit/d18NativeGeometryRoundTrip.test.ts` runs source content rewrite, saves, independently reopens the PDF, traces image CTMs and compares true rendered positions against masked resource identity. The separate `nativeImageEvidenceD15.test.ts` includes five new source/render correspondence refusals. The four-image/two-mask, untouched sibling and target-location browser assertions remain unweakened.
3. **Confirmed 320px editor overflow** — `src/views/EditorPage.tsx`: eight fixed 44px icons could not fit the 320px compact viewport; remove only the extra toolbar Keyboard shortcuts icon while retaining the actual help dialog inside the More tools menu and restoring focus to More tools after close. `tests/e2e/mobile.spec.ts` asserts seven 44px controls wholly on-screen, no horizontal overflow, available keyboard help and focus recovery.
4. **Actual offline Home contract** — `tests/e2e/pwa.spec.ts` now checks the current, source-verified `Start with a file` heading rather than removed `Less work… More done` marketing copy. It **still requires** actual service worker readiness, a fully cached consumer core and a browser-network-disabled reload.
5. **Independent automatable evidence** — `.github/workflows/d18-browser-fidelity.yml` runs unit/TypeScript/build/security, three real browsers with native-PDF export/reopen and PWA/visual workflow, two mobile/tablet profiles, and a read-only live Pages probe.

## Public Pages, stable tag and rollback

- Authoritative repo README states published URL: **https://thiepn.github.io/pdf/**. External web inspection of `/`, `release-metadata.json`, `release-integrity.json` and `sw.js` was attempted this turn, but the fetch mechanism **could not access the URLs**. This is **not positive live evidence**; D18's read-only CI probes the README-documented address and retains the result, failing closed when unavailable.
- Verified annotated stable tag `v7.1.4`: tag object `f697ff30b9bb1974eec3993720f12eb8b060ffe3` → commit `2116a61b73b6fdb18aa19a8175d9ebae4b43c159`. That tag identity does **not** prove which binary and cache currently serve at Pages.
- Last recorded production main `6f4f5c1b3b20a0565795879bef77265a4cdea6c0`; requires fresh check before any release. The D15 scope was 731 commits ahead/295 files changed vs main, including inherited P17 foundation. Full dependency and ownership review is required.
- GitHub Pages production publication occurs through protected `main` and release tag workflows. No Pages workflow was dispatched; no stable tag was altered.

## Fail-closed automated gates

| Gate | D18 status |
| --- | --- |
| Source geometry and native unit tests | Pending exact-head CI |
| TypeScript, verified build, privacy/security audit | Pending exact-head CI |
| Actual P17 masked editing, independently reopened PDF with four images/two masks | **Unqualified**; D15 previously failed |
| Native browser Chromium/Firefox/WebKit | Pending exact-head CI |
| PWA offline cache, network-disabled reload | Pending exact-head CI |
| 320px mobile Chromium, tablet WebKit, 44px controls and accessible help | Pending exact-head CI |
| Entire PDF Studio regression matrix, including form/redaction/Word/quick tools | **Unqualified** until complete green full CI |
| Pages canonical live metadata/asset consistency | **Unverified**; external read failed; CI probe pending |
| Real physical Android/iOS/tablet, assistive tech and P18 reader acceptance | Human-only pending |
| D8 original 18-item release evidence, documented rollback and release owner | **0/18 approved** in original template; no self-approval |

## D8 human acceptance inventory

All eighteen keys in `docs/design/D8_RELEASE_EVIDENCE.template.json` remain pending and must be completed independently with actual reference, valid evidence source and named reviewer. Categories cover: editor integration; selection/history/persistence; real processing/download; phone/tablet runtime; keyboard/focus/status; verified source build; real Chromium/Firefox/WebKit; exported PDF reopen and native P17 fidelity; P18 device reader; security/privacy; dark/light/forced colors; keyboard screen reader; physical phone/tablet; zero release blockers; and rollback/deploy approval.

**No automatic merge, deployment, screenshot/golden approval, or claimed physical-device test.** A passing D18 gate prepares D8 human review; it does not satisfy that review by itself.

## Following phase

**D19 — Exact-Head Native Browser Closure & Human Acceptance Packaging.** If any D18 gates fail, fix the source and rerun without relaxing test assertions. After all automated gates are proven green, organize actual physical-device, accessibility, signed provenance and rollback evidence for independent reviewer approval. Keep production unchanged until release-owner authorization.

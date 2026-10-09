# D17 — Native Fidelity Closure & Exact-Head Qualification

**Release state: NOT_QUALIFIED**. The D17 work is stacked as a draft PR above D16, D15, D14 and D13. None of these branches has been merged into production; no Pages deployment or tag has been created.

## Evidence and confirmed defects

- D13 exact head `8adbc91071123ee5df4784b099042d82e8739658`: D13 structural/real-PDF integration, D12 visual, performance, R10 passed, but the full browser CI failed.
- D14 exact head `7b2b16b8c3c045536ad5454e1118d55a8f1a7bdc`: P17 browser export failed on a transformed attached-soft-mask image.
- D15 exact head `68e285281507358ede15ed5c07a0dd7548c0ea2a`: [P17 generated-fixture Chromium](https://github.com/thiepn/pdf/actions/runs/37937196068) **failed**: `Masked image transform did not preserve its attached soft mask on page 1.` D15 unit/typecheck passed in its separate focused workflow, while WebKit D14 independent reopened-export also failed.
- D16 exact head `44b07951476a086c8002b46cb601560bcef5ed4e`: ancestry/source/typecheck preparation [job succeeded](https://github.com/thiepn/pdf/actions/runs/37940441719), but three real browser jobs remained queued when D17 was initiated.
- Previous D14 render failure: source had four `Do` image paints yet independent image evidence showed fewer visible images. **Source operators alone are not adequate proof** of an intact PDF.

## D17 changes — do not confuse implementation with verification

1. `src/native/nativeImageEvidence.ts` adds **one-to-one image-instance correspondence** after independent reopen, with unique sibling matching and an excluded/reserved transformed target. It rejects missing original image paints, duplicate one-to-many matches and lost attached masks; it retains the existing conservative 4-point geometry distance.
2. `src/workers/native-image.worker.ts` records device-backed masked image evidence and requires all original attached masks to survive. For cases where MuPDF structured text omits masked paints, a **conservative direct XObject fallback** associates a source `/SMask` with a *real, uniquely matched rendered device image* only when bounding geometry is unambiguous and no clipping, explicit mask or non-Normal blend is present. The resulting PDF still must pass independent rendered-image, mask and page checks. No source-only mask acceptance or bypass.
3. Expanded existing unit tests for distinct siblings, duplicate overlap, missing images, transformed-target collision and vanished soft mask.
4. `scripts/design/d17_live_pages_probe.py` independently reads the **actual deployed** HTML, release metadata, release integrity manifest, offline asset manifest and service worker from a reviewer-configured HTTPS Pages base. It compares version, channel, epoch, asset counts and release identity. It does **not** claim a live artifact originated from the stable Git tag without a separate attestation.
5. `.github/workflows/d17-native-fidelity-release.yml` performs immutable D16 ancestry audit, unit tests, TypeScript, verified build, security audit, Chromium/Firefox/WebKit real-PDF import/edit/download/independent MuPDF reopen checks, plus independently configured production Pages verification.

## Production reference

- Observed production `main`: `6f4f5c1b3b20a0565795879bef77265a4cdea6c0`. Must recheck before release.
- Verified GitHub published stable `v7.1.4` annotated tag `f697ff30b9bb1974eec3993720f12eb8b060ffe3` → commit `2116a61b73b6fdb18aa19a8175d9ebae4b43c159`.
- The live Pages artifact was **not independently retrievable through current external inspection**. The workflow explicitly requires repository variable `PDF_STUDIO_PUBLIC_URL` pointing to the real published site; it will fail closed if the variable is missing. Do not guess the hostname, silently assume `*.github.io`, or claim tag-to-artifact attestation from matching metadata alone.
- D15-versus-main comparison captured **731 commits ahead and 295 changed files**; this inherited P17 scope needs a complete human code/provenance review.

## Qualification checklist

| Gate | Status | Exact requirement |
| --- | --- | --- |
| D17 native evidence unit tests | Pending latest exact-head GitHub Actions | Mask count, unique sibling and target match, genuine loss refusal |
| P17 real PDF soft-mask edit | **Known failing in D15; D17 unproven** | Rendered four images, two source-attached masks, unchanged sibling, moved selected image on reopen |
| D14/D15/D16 independent PDF test | Pending exact-head | Chromium, Firefox and WebKit, export and real downloaded-PDF reopen |
| Source/typecheck/verified build/security/performance | Pending exact-head | No disabled checks, verifiable build artifacts |
| Full PDF Studio CI | **Known failing in prior exact-head** | Resolve all browser and PWA/reader/editor/quick-tool regressions |
| Pages live asset check | **Not verified** | Set `PDF_STUDIO_PUBLIC_URL`, inspect HTML/SW, checksum manifests and cache |
| D8 human acceptance | **18 pending** | Named source-backed manual approvals |
| P18 + physical devices | Pending | Actual Android/iOS/tablet, accessibility, offline/PWA, touch |
| Rollback and production approval | Pending | Exact commit + stable archive hashes, GitHub Pages deployed hash, branch/PR review and owner signoff |

**Release decision:** Do not merge, retarget to main, mark qualified, dispatch production Pages workflows, tag, or deploy. If D17 exact-head browser qualification fails, fix the PDF writer or evidence interpretation only against independently reproduced document facts, never by weakening preservation checks.

## Next phase

**D18 — Browser Fidelity Remediation & Release-Gate Closure**: inspect D17 exact-head CI; fix remaining native writer and browser regressions, verify live Pages after correct URL is configured, prepare human evidence without fabricating signoff. Remain draft until independently qualified.

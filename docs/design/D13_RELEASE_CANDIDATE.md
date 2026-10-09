# D13 — Redesign integration and release-candidate preparation

**State:** integration candidate implemented, **not merged**, **not release qualified**, no deployment authorized.

## Exactly what D13 contributes

- Exact, inspectable D1–D12 branch/commit/PR inventory: `D13_INTEGRATION_MANIFEST.json`.
- Git lineage audit found D5 PR #133 ended with a fix commit that was independently replayed as the final commit of D6. The GitHub commit patches for `fae344e0` and `13436ff6` are identical. D13 keeps both SHAs and **requires matching Git `patch-id --stable` fingerprints and inclusion of the replay commit**; an unverified rebase is rejected.
- A reproducible source/ancestry preflight that rejects broken lineage, duplicates, missing real mounts or altered D8 evidence. It **never** grants release approval.
- Repair of D11/D12 CSS tests: move Node filesystem assertions to `.test.mjs` (the app's TypeScript compilation does not include Node types). The CSS-pattern audit now strips comments before inspecting actual CSS rules, so writing the word `!important` in a caution comment does not fail CI.
- Dedicated D13 browser test opening a genuine two-page PDF, changing the page/zoom, downloading a real output and reopening it through an independent MuPDF reader; mobile light/dark visual captures included.
- A dedicated [D13 GitHub Actions workflow](../../.github/workflows/d13-integration-candidate.yml) with immutable ancestry audit, TS build, D11/D12 checks, unchanged D9 wiring audit, untouched D8 report and Chromium/Firefox/WebKit evidence.

## Important integration dependency

**D1 PR #125 does not originate on `main`.** It is based on `feature/p17-deep-native-content-fidelity` at commit `dd23b3c2a0563de7c429fe42738f0d5d748e478e`, whereas `main` was observed at `6f4f5c1b3b20a0565795879bef77265a4cdea6c0` on 9 October 2026. The exact lineage is required because rewriting or merging directly into `main` without reconciling that foundation may omit P17 behavior or introduce unrelated changes.

Source PR order for review:

| Phase | PR | Dependency |
|---|---:|---|
| Foundation | P17 feature branch | Must reconcile/qualify against current main first |
| D1–D2 | #125 → #126 | File-first Home and searchable tools |
| D3–D4 | #130 → #131 | Live editor and selection/layer transactions |
| D5–D7 | #133 → #134 → #135 | Live Quick Tools, responsive controls, accessibility |
| D8–D9 | #136 → #137 | Evidence gate and structural runtime audit |
| D10–D12 | #139 → #141 → #143 | Live document status, shared visual scale, visual QA |
| D13 | This stacked draft PR | Preflight, integration evidence and merge preparation |

**Do not automatically merge the draft stack**; review P17 dependency and current production divergence first. A safe integration operation is a separate, reviewable rebased/integrated candidate, with a complete build, exported-PDF fidelity comparison, checked dependency diff, tests and visual QA before main. Preserve this original review chain for traceability.

## Release criteria — all independent

1. **CI:** Full PDF Studio CI, D1–D13 specialist browser and type checks, actual build and performance requirements are green on the same candidate SHA. All required checks must reference the candidate, not an older superseded run.
2. **Real PDF:** Verify multiple real document classes, export, reopen with an independent reader, text/image layer fidelity and warnings, P17 native fidelity and P18 device/reader policies.
3. **Accessibility and visuals:** human review of desktop/tablet/phone screenshot captures in light, dark and forced-colors themes; real keyboard and screen-reader pass; no tool truncation, loss of panel controls or viewport overflow.
4. **Security and recovery:** encryption, redaction, privacy/no-upload claim, local save/export distinction, storage recovery and destructive action review. Do not replace tests with styling-only screenshots.
5. **Hardware:** physical Android/iOS tablet/phone and desktop-browser devices where applicable; all real-device results must be recorded and reviewed.
6. **Release authority:** pass all **18 original D8 requirements** with real references and human reviewer IDs, gain explicit human deploy/rollback approval, preserve verified production build and tested rollback.

## Qualification commands

```sh
python scripts/design/d13_integration_preflight.py --repo . --check-ancestors --assert-prepared
python -m unittest discover -s tests -p d13_integration_preflight_test.py -v
npm ci --no-audit --no-fund
npm run typecheck
npx vitest run tests/unit/studioDesignD11.test.mjs tests/unit/studioDesignD12.test.mjs
npx playwright test tests/e2e/d13-release-candidate.spec.mjs --project=chromium --project=firefox --project=webkit
python scripts/design/d9_live_mount_audit.py --repo .
python scripts/design/d8_live_gate.py --evidence docs/design/D8_RELEASE_EVIDENCE.template.json
```

D13 preflight `PASS` means code *composition* is consistent. D8 `NOT_QUALIFIED` means **do not release**. These are intentionally separate results.

## Promotion and rollback plan

Once the integration base and all real evidence are approved, preserve the last known good main/stable tag and its verified Pages/PWA distribution, record the exact reviewed merge SHA, deploy through the existing protected release process, verify live import/edit/export/refresh/offline rollback on the published domain, and retain the previous verified distribution for rollback. Any failing launch smoke test or release gate means stop promotion and restore the previous known-good artifact. No automatic branch force-pushes or tag promotions are part of D13.

**Next decision:** After D13 CI and P17 reconciliation, undertake the controlled integration review. Do not call D13 itself V1.0 or a production release.

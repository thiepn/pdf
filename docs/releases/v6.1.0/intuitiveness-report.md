# v6.1.0 Intuitiveness & Discoverability Qualification

v6.1.0 is a usability-focused release on the qualified v6 architecture. No PDF engine feature or persisted schema is changed.

## Qualification goals

1. One canonical name per major workflow.
2. Simple mode exposes ordinary work first and hides technical surfaces by default.
3. Viewer controls do not duplicate workspace navigation.
4. Editor tools are grouped by user intent rather than implementation type.
5. Redaction distinguishes marking from permanent application.
6. OCR exposes understandable quality presets before raw image parameters.
7. Page-range syntax has discoverable examples.
8. Advanced PDF terminology is explained or placed under technical details.
9. Every major workflow has bundled offline Help.
10. Existing reliability, migration, privacy, PDF-corpus, PWA, and release gates remain active.

## Dedicated regression

`scripts/releases/v6.1.0/runtime-regression.mjs` verifies the user-interface invariants above and is included in `release:web`, candidate GitHub Pages deployment, and the tagged stable-release qualification path.

## Stable boundary

This report does not replace the exact lockfile-derived Vite/Vitest/Playwright qualification. Source builds remain release-candidate until the GitHub-hosted stable workflow passes every hard gate.

## Final audit outcome

The final pass also removed specialist implementation vocabulary from the advanced structure view, changed print-layout spacing inputs to millimetres, simplified trusted-certificate wording, and clarified advanced form-field labels. Technical reports and specialist details remain available without being required for ordinary use.

Final dependency-independent qualification is green: the v6.1.0 intuitiveness regression is 15/15, source audit reports 0 failures, Pages/PWA readiness reports 0 failures, historical runtime and maintenance suites pass, the original 11-file corpus and 56-file adversarial corpus pass, and migration/security audits remain 10/10 and 8/8 respectively.

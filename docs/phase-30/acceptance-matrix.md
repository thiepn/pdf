# Phase 30 Acceptance Matrix

| Gate | Requirement | Status in this environment |
|---|---|---|
| Frozen identity | `6.0.0`, default release-candidate | PASS |
| Stable promotion | Exact `v6.0.0` tag and stable build metadata | PASS (workflow/source) |
| Release-freeze runtime | Phase 30 structural invariants | PASS — 12/12 |
| Migration audit | Declared v1–v9/state migration paths | PASS — 10/10 |
| Security/privacy audit | Final local-first/privacy invariants | PASS — 8/8 |
| Phase 11 runtime | Dependency-independent core runtime | PASS — 15/15 |
| Original corpus | External-reader PDF corpus | PASS — 11/11 |
| Historical runtime | Phase 16 through Phase 30 | PASS |
| Adversarial corpus | Phase 28 expanded corpus | PASS — 56/56 |
| Offline semantic TypeScript | Dependency-independent semantic check | PASS |
| Production source audit | Internal imports and release invariants | PASS |
| Pages/PWA readiness | Static deployment/PWA invariants | PASS, missing-lock warning only |
| Full TS/TSX test parse | Implementation + tests/E2E | PASS — 243/243 |
| Workflow YAML | All GitHub Actions parse | PASS — 4/4 |
| Exact npm lock | Committed npm v3 lockfile | PENDING — registry unavailable here |
| `npm ci` | Clean exact install | PENDING with lockfile |
| Vitest | Real installed dependency suite | PENDING with lockfile |
| Vite production build | Real exact build | PENDING with lockfile |
| Reproducible fingerprint | Two exact builds identical | PENDING on GitHub |
| Desktop Playwright | Chromium + Firefox + WebKit | PENDING on GitHub |
| Responsive Playwright | phone Chromium + tablet WebKit | PENDING on GitHub |
| Offline installed-PWA | Deployed exact artifact | PENDING on GitHub |
| Live Pages smoke | Stable metadata + SW + integrity | PENDING on tagged GitHub workflow |
| GitHub Release | Publish only after live smoke | PENDING by design |

## Promotion rule

`v6.0.0 Stable` may be declared only after every pending hard gate above passes on the authoritative GitHub-hosted workflow. Until then the frozen source remains `6.0.0 release-candidate`.

# Phase 11 Acceptance Matrix

| Gate | Result | Evidence |
|---|---|---|
| Exact direct dependency versions | Pass | `npm run audit:dependencies` |
| Published Playwright version | Pass | `@playwright/test` 1.62.0 |
| Vite-compatible Node floor | Pass | `>=22.12.0` |
| Source/privacy policy audit | Pass | `source-audit-report.json` |
| Internal semantic/null-safety gate | Pass | `npm run typecheck:offline` |
| Pure runtime regression | Pass | `npm run test:runtime:offline` |
| Deterministic corpus generation | Pass | 11 files plus manifest |
| PyMuPDF validation | Pass | `corpus-validation-report.json` |
| pypdf validation | Pass | `corpus-validation-report.json` |
| Redaction marker removal | Pass | Both readers report secret text absent |
| AES-256 authentication | Pass | Both readers authenticate fixture |
| Malformed input rejection | Pass | Both readers classify failure safely |
| 200-page independent-reader test | Pass | Page and terminal marker validation |
| Committed npm lockfile | Pending | Required before stable tag |
| Official TypeScript build | Pending CI | Requires npm registry |
| Vitest | Pending CI | Requires npm registry |
| Vite production distribution | Pending CI | Requires npm registry |
| Chromium/Firefox/WebKit | Pending CI | Requires Playwright installation |
| Deployed GitHub Pages validation | Pending deployment | `#/validation` report required |
| Adobe Reader/PDF24/mobile/print matrix | Pending manual lab | See `external-reader-matrix.md` |

## Decision

The Phase 11 implementation is complete. The stable release decision remains blocked by every row marked Pending.

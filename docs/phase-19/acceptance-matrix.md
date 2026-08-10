# Phase 19 Acceptance Matrix

| Capability | Gate | Expected |
|---|---|---|
| PDF/A XMP helpers | Phase 19 runtime/unit | PASS |
| Signature ByteRange current/prior/invalid classification | Phase 19 runtime/unit | PASS |
| External signer result rejects non-PDF payload | Phase 19 runtime/unit | PASS |
| Metric print conversion and RTL booklet order | Unit | PASS |
| Compliance state/package migration | Offline type/source audit | PASS |
| Recursive worker compiles against current types | Offline semantic check | PASS |
| Existing Phase 16–18 regressions | Runtime suites | PASS |
| Malformed/encrypted/forms/Unicode/redaction corpus | Phase 11 gate | PASS |
| Official production dependency build | npm/Vite | REQUIRED FOR STABLE |
| Chromium/Firefox/WebKit E2E | Playwright | REQUIRED FOR STABLE |
| PDF/A independent validator | External validator | REQUIRED FOR CERTIFIED CLAIM |
| PDF/UA meaningful tagged fixture | External accessibility validator | REQUIRED FOR PDF/UA CLAIM |
| PAdES trust/CMS validation | Qualified verifier | EXTERNAL BOUNDARY |

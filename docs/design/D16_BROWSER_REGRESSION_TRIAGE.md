# D16 — Full browser CI triage and exact-head qualification

**Release state:** **NOT_QUALIFIED**. This triage records observed failures; it neither skips tests nor authorizes merging. The last complete broad CI matrix available for inspection was D13's exact-head [PDF Studio CI run 37922133251](https://github.com/thiepn/pdf/actions/runs/37922133251) at `8adbc91071123ee5df4784b099042d82e8739658`, whose browser-regression aggregate failed. D15 and D16 exact-head workflows were still queued when this inventory was authored.

## Existing broad CI failure inventory

Eight browser regression shards failed in the D13 run. The following counts are per-shard **failing test outcomes**, not unique defects; different browsers and cascading setup errors can repeat the same root cause.

| Shard | Failing test outcomes | Relevant categories |
| --- | ---: | --- |
| chromium, 1/2 | 19 | Native text/image/vector editor, P17 masks, OCR, target-size compression, status and visual source |
| chromium, 2/2 | 29 | Tables, forms/redaction, shared nested PDF content, PWA, navigation, tool discovery and release/Word export |
| firefox, 1/2 | 11 | Editor reliability, P17 mask, OCR, D10/D11, P15 |
| firefox, 2/2 | 17 | Reader fallback, forms/redaction, PWA, tool discovery, release, smoke |
| webkit, 1/2 | 11 | Native editor reliability, P17 mask, OCR, D10/D11, P15 |
| webkit, 2/2 | 17 | Forms/redaction, PWA, command routing, tool discovery, Word export, smoke |
| mobile-chromium, 1/1 | 1 | Compact phone editor interaction/download |
| tablet-webkit, 1/1 | 2 | Compact toolbar geometry and editor interaction/download |

**Important:** 107 observed failing test outcomes across eight shards is not evidence of 107 independent regressions. Re-run on the exact new head and trace root causes before editing tests.

## Priority and refusal policy

### P0 — Document corruption / unauthorized output (release blocking)
- P17 attached-soft-mask transform: the D14 browser matrix confirmed native validation refused a PDF because unchanged sibling image position/evidence differed; an earlier path rendered only two of four expected images after export. D15 changed the baseline to use consistent device-space evidence but the latest exact-head result is still pending.
- Existing native text/image/vector/table/complex/form/redaction editing and export test failures may be distinct PDF writer defects. Prove document-page/text/image/form and encryption/sanitization invariants with independent reopen; **never remove tests, broaden tolerance, or publish a known-corrupt output**.
- Tests that intentionally delete/redact content must continue to require sanitized source bytes, signed-field safety and unaltered unrelated content.

### P1 — Real product and responsive behavior
- Mobile/compact editor actions, touch targets, status bar, import/export and rotated canvas.
- Reader/history, direct routes and PWA/offline update/recovery.
- Actual keyboard, focus and screen reader behavior, dark/light/forced colors.

### P2 — Stale selectors only after product evidence
- D10, P40 and P42 tests have been updated in D15 to match intentional project display and the real Tool Library / browser-stable download route.
- D11 and other retired UI assumptions must be confirmed against the current rendered product, not mechanically edited to pass. Source test tweaks are **not** qualification without the real browser result.

## D16 source of truth

1. Production `main`: `6f4f5c1b3b20a0565795879bef77265a4cdea6c0`, observed 9 October 2026. Must be refetched immediately before any release.
2. D16 stacked draft source: see [PR #149](https://github.com/thiepn/pdf/pull/149), based on D15 #148, D14 #147, D13 #145.
3. Independent file provenance: [D16 scope manifest](D16_RELEASE_SCOPE_MANIFEST.json).
4. Physical devices + review: original D8 18-item evidence inventory remains **unapproved**.

A future D16/D17 CI rerun must correlate failures to the **exact head SHA**, archive browser traces, fix confirmed defects in source, preserve strict native-PDF and security validation, and rerun all affected browser shards. No merge/deploy until this is complete.

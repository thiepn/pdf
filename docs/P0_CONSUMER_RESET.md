# P0 — Consumer Product Reset & Architecture Cleanup

## Status

Implemented on `agent/p0-consumer-reset`.

P0 deliberately adds no new PDF editing capability. Its purpose is to make PDF Studio's architecture match the consumer product goal before deeper editing/OCR work continues.

## Changes

### 1. Consumer product boundary

The runtime is now explicitly divided into four tiers:

- consumer core;
- on-demand PDF tools;
- optional desktop companion;
- enterprise security archive.

The C.19-C.45 enterprise/PQ/security work remains preserved as optional research but is not part of the normal browser-runtime requirement.

### 2. Route-level loading

`src/App.tsx` keeps Home eager and loads secondary routes with `React.lazy` + `Suspense`.

Lazy top-level routes include Projects, Settings, Storage, Diagnostics, Quick Tools, Merge, Scan, Batch, Compare, Create PDF, Release, Validation, Activity, Maintenance, Help, and the unified document workspace.

This prevents normal startup from importing every product surface before the user opens it.

### 3. PWA cache strategy

The generated offline manifest is now schema v2 and distinguishes:

- `coreAssets`: shell resources installed immediately;
- `optionalAssets`: specialist chunks cached by the existing service-worker runtime cache after first use.

The legacy-compatible `assets` field now intentionally contains only `coreAssets`.

This prevents PWA installation from eagerly downloading every specialist feature while retaining offline reuse after a feature has been opened once.

### 4. Production bundle defaults

- source maps are disabled by default and remain opt-in with `VITE_SOURCE_MAPS=true`;
- Vite's large-chunk warning limit is reduced from 1400 KB to 800 KB;
- compressed-size reporting remains enabled.

### 5. Performance guardrail

`scripts/audit-consumer-performance.mjs` verifies:

- route splitting markers;
- the consumer/enterprise runtime boundary;
- v2 core/on-demand offline manifest structure;
- specialist chunks do not leak into the PWA core cache;
- core JavaScript gzip budget;
- total core-precache gzip budget.

Default CI budgets:

- core JS: 800 KiB gzip;
- total consumer precache: 1600 KiB gzip.

These are initial anti-regression ceilings, not final performance targets. Later performance phases should reduce them using measured device baselines.

### 6. CI

`.github/workflows/consumer-performance.yml` runs on pull requests and main pushes:

1. exact `npm ci`;
2. TypeScript;
3. production build;
4. consumer performance audit.

### 7. Tests

`tests/unit/featureTiers.test.ts` locks the product-tier invariants, including the requirement that enterprise-security and native integration are not required by the browser default bundle.

## Deliberately not changed in P0

- PDF editing behavior;
- OCR algorithms;
- export formats;
- persistent PDF/project schemas;
- security/redaction behavior;
- current consumer navigation vocabulary;
- document-workspace internal mode splitting.

The unified workspace is now route-lazy as a whole. Individual workspace modes still share its internal chunk and should be split further only after a measured bundle profile proves which modes dominate PDF-open latency. This avoids blindly fragmenting critical viewer/editor code before profiling it.

## Next phase

P1 — Universal Existing-Content Editing.

Priority: make existing PDF text editing materially closer to document editing rather than bounded overlay/reconstruction, including paragraph reflow, font matching, block editing, complex-script shaping, and reliable inline redact-and-replace.

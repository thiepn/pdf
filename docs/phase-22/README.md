# Phase 22 — Stable Web Release Qualification

Phase 22 keeps Local PDF Studio a **browser-first static web application**. It does not introduce a desktop dependency or server backend. The release target is an installable PWA that can be built by Vite and deployed directly to GitHub Pages.

## 1. Deployment invariant

All runtime URLs must work for both:

- a normal GitHub Pages project site: `https://<user>.github.io/<repository>/`;
- a root/custom-domain deployment: `https://pdf.example.com/`.

Vite's base path is therefore the canonical deployment root. Runtime code must not infer assets from the current navigation URL.

`PAGES_BASE_PATH` defaults to `/<repository>/` in GitHub Actions. Set the repository variable to `/` for a root/custom-domain Pages deployment.

## 2. Hash routing

Application navigation remains hash-based (`#/workspace/...`). GitHub Pages therefore only needs to serve the application entry point; application routes do not depend on server-side rewrite rules.

## 3. PWA ownership

The service worker URL and scope are derived from `import.meta.env.BASE_URL`. Release caches and OCR language caches are namespaced with a deterministic token derived from that base path.

Activation only removes earlier release caches sharing the current deployment namespace. Fetch interception is limited to the worker's scope path and same origin.

Maintenance follows the same ownership rule. It does not delete arbitrary Cache Storage entries and does not unregister service workers belonging to other scopes on the same origin.

## 4. GitHub Pages origin boundary

A path is not a browser security origin. Multiple project sites under the same `username.github.io` hostname share origin-level APIs such as IndexedDB, OPFS, localStorage, Cache Storage, and BroadcastChannel.

Phase 22 prevents accidental cache/service-worker interference and reports this condition in release validation. Strong storage isolation requires a dedicated hostname/origin.

## 5. Deterministic release gate

Production deployment no longer falls back to `npm install`. A committed `package-lock.json` is mandatory and all release jobs use `npm ci`.

Because the current execution environment cannot resolve the pinned Playwright package, the repository includes **Bootstrap dependency lock**. Run it once on GitHub; it generates the lock from the exact pinned `package.json`, verifies a clean install, pushes `phase22-dependency-lock`, and opens a PR.

## 6. Browser matrix

Playwright uses the configured Pages base path as its base URL. Existing E2E routes were converted from origin-absolute `/#/...` navigation to deployment-relative `./#/...` navigation.

Additional Phase 22 checks verify:

- manifest/icons resolve inside the configured base;
- service-worker scope equals the deployed application base;
- the already-loaded application shell can reload while the browser context is offline.

## 7. PWA install surface

The manifest provides repository-relative identity, scope and shortcuts, plus:

- 192 × 192 PNG icon;
- 512 × 512 PNG icon;
- 512 × 512 maskable icon;
- SVG fallback;
- Apple touch icon;
- safe-area capable mobile viewport.

## 8. Deployment sequence

See [GitHub Pages deployment guide](github-pages-deployment.md).

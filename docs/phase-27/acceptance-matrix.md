# Phase 27 Acceptance Matrix

| Gate | Requirement |
|---|---|
| Exact dependency graph | Committed npm lockfile v3 matches all exact root pins |
| Toolchain | Supported Node 22 + pinned npm 10.9.2 |
| Clean install | `npm ci` succeeds |
| TypeScript | Official `tsc -b` succeeds |
| Unit suite | Vitest succeeds |
| Production build | Vite + offline manifest + dist audit succeed |
| Reproducibility | Two same-commit builds produce identical dist fingerprints |
| Dependency tree | `npm ls --all` succeeds |
| Security | npm high-severity audit gate succeeds |
| Desktop browsers | Chromium + Firefox + WebKit |
| Responsive browsers | phone Chromium + tablet WebKit |
| Artifact identity | Playwright tests the previously verified `dist` |
| Pages deployment | Only a browser-qualified artifact can be uploaded/deployed |
| Live smoke | shell, manifest, worker, integrity manifest, offline manifest, icons |
| External PDF corpus | Phase 11 11-file corpus remains green |

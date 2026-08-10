# Phase 22 Acceptance Matrix

| Capability | Gate | Expected |
|---|---|---|
| Repository base normalization | Phase 22 runtime | PASS |
| Deterministic cache namespace | Phase 22 runtime | PASS |
| GitHub project-site shared-origin detection | Phase 22 runtime | PASS |
| Custom-host deployment assessment | Phase 22 runtime | PASS |
| Vite repository/custom base support | Pages readiness audit | PASS |
| Pages workflow uses configure/upload/deploy actions | Pages readiness audit | PASS |
| Deploy and CI use `npm ci` without fallback | Pages readiness audit | PASS |
| Service-worker fetch/cleanup stays within deployment scope | Source + Pages audit | PASS |
| Maintenance cannot clear unrelated same-origin caches/workers | Source + Pages audit | PASS |
| Repository-relative manifest/start/scope | Pages readiness audit | PASS |
| 192/512/maskable/Apple install icons | Pages readiness audit | PASS |
| Service-worker version and scope agree with application | Browser release validation | REQUIRED |
| PWA shell reloads offline | Playwright Chromium/Firefox/WebKit | REQUIRED |
| E2E runs under `/<repository>/` base | Playwright Chromium/Firefox/WebKit | REQUIRED |
| Exact dependency graph is committed | Git | REQUIRED FOR STABLE |
| `npm ci` clean install | GitHub CI | REQUIRED FOR STABLE |
| TypeScript/Vitest/Vite verified build | GitHub CI | REQUIRED FOR STABLE |
| Production dependency audit | GitHub CI | REQUIRED FOR STABLE |
| Deployed Pages shell/manifest/worker/icons/integrity | Deploy smoke | REQUIRED FOR STABLE |
| Existing malformed/encrypted/forms/Unicode/redaction corpus | Phase 11 gate | PASS |

# Build Report — 6.0.0 Release Freeze

Phase 30 freezes Local PDF Studio at semantic version `6.0.0`. Source builds default to the `release-candidate` channel; the exact `v6.0.0` tag workflow is the only supported path to a `stable` artifact.

## Completed locally

- Phase 11 dependency-independent runtime: **15/15**.
- Original external-reader PDF corpus: **11/11**.
- Historical Phase 16–30 runtime regression chain: **PASS**.
- Phase 28 adversarial corpus: **56/56**.
- Phase 30 release-freeze runtime: **12/12**.
- Phase 30 migration audit: **10/10**.
- Phase 30 security/privacy audit: **8/8**.
- Offline TypeScript semantic check: **PASS**.
- Production source audit: **192 source files / 575 internal imports / 0 failures**.
- GitHub Pages/PWA readiness: **29 pass / 0 fail / 1 intentional missing-lock warning**.
- Implementation + unit/E2E TypeScript semantic sweep: **243/243 PASS**.
- GitHub Actions YAML parse: **4/4 PASS**.
- README local-link audit: **75/75 PASS**.

## Final release architecture

- `main`/ordinary builds: `release-candidate`.
- exact `v6.0.0` tag: stable qualification workflow.
- stable artifact is built once, audited, fingerprinted, browser-tested, deployed, live-smoke-tested, then published.
- `release-metadata.json` exposes version/channel provenance to deployment smoke tests.

## Exact dependency boundary

The repository deliberately contains no fabricated `package-lock.json`. A final lock generation attempt against the configured registry returned `404` for `@playwright/test@1.62.0`; a direct public-registry check failed with `EAI_AGAIN`. No partial/fabricated lockfile is retained. Exact npm installation, Vitest, Vite, Playwright, reproducibility, installed-PWA and live Pages smoke gates therefore remain pending until the lock bootstrap workflow can resolve the official dependency graph on GitHub.

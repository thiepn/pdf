# PDF-04 — Isolated, audited dependency security repair

Baseline: PDF-03 PR #166 at `cc3f6a2c447b155ea545905133fb3a7fd5cec897`. This separate draft branch changes the two direct exact-version dev dependencies and requires a narrowly pinned transitive Undici fix; it must not modify D19, PDF-03, P18, PR #164 or main.

Pinned proposed security minima (subject to **real registry audit**, not assumptions): `vite 8.1.5 → 8.1.6`, `vitest 4.1.11 → 4.1.12`, and transitive `undici 7.29.1 → 7.30.1` via a single exact npm override justified by the jsdom transitive dependency. All other direct dependencies remain untouched. Original CI: https://github.com/thiepn/pdf/actions/runs/42012268629, 4 npm findings (2 high, 2 moderate).

Authoritative lockfile procedure: npm 10.9.2 on Node 22.16.0 installs package-lock-only with ignored scripts in a dedicated exact-head GitHub job, verifies lockfile-v3 structure and integrity, executes `npm ci`, `npm audit --audit-level=moderate`, TypeScript and PDF-03 original 28 units, preserves its generated lock as a GitHub artifact and pushes **only** the generated `package-lock.json` to the isolated draft branch if the HEAD lease still matches. No audit disable or manual integrity reconstruction. The automatic commit does not assert full native-browser qualification.

Required continuation: observe generated lock artifact/commit and independently verify GitHub result; trigger a fresh exact-head full CI and PDF-03 Chromium/Firefox/WebKit matrix with the final actual lockfile. Remain release-blocked while D16 main ancestry and all 18 human/device approvals are pending. No release, signing, deploy, merge, publication, tag, or live migration.


## Sanitized primary-source resolution evidence, 2026-11-05
GitHub Actions [PDF-04 sanitized npm diagnostic](https://github.com/thiepn/pdf/actions/runs/42033844414) at Node 22.16.0/npm 10.9.2 shows:
- Isolated `vitest@4.1.12` and `vitest@4.1.11` **both** fail in `Arborist.#loadPeerSet` after auto-resolution of optional `@vitejs/devtools` -> devtools-vite/devtools-vitest -> `vitest@*` -> `@vitest/browser-playwright@5.1.0`. Thus the failure is **not caused solely by the security version bump**.
- `--prefer-dedupe`, `--omit=optional`, `--omit=peer` and shallow install do not resolve the crash. The diagnostic-only `--legacy-peer-deps` control resolves successfully.
- Direct registry metadata confirms Vitest optional browser peers and Vite's optional devtools peer; npm 10 does not report a normal `ERESOLVE` conflict.
- Narrow experimental generation-only workaround: npm 10.9.2 lockfile generation uses `--legacy-peer-deps` but normal `npm ci`, `npm ls --all`, mandatory real-registry `npm audit --audit-level=moderate`, TypeScript, and exact PDF-03 tests all run **without** that flag. No permanent `.npmrc` bypass.
- The one permitted transitive override, `undici:7.30.1`, is to prevent renewed resolution of the known-vulnerable jsdom dependency. If normal installation, audit, lock-diff or any regression fails, the branch stays blocked.

## Authentic security-lock qualification
The npm-10.9.2 GitHub Actions [run #42034278109](https://github.com/thiepn/pdf/actions/runs/42034278109) passed: bounded old-to-new lockfile diff (14 version identities; exactly 169 package entries before and after); npm lockfile v3/registry integrity; normal **no-peer-workaround** `npm ci`; `npm ls --all`; real `npm audit --audit-level=moderate` reporting **zero vulnerabilities**; TypeScript and 28/28 actual PDF-03 worker/geometry/unit tests. The runner committed only the authentic lockfile on the same draft PR, commit `783e09f6fa927729f37b8d15480016200a9e9333`.
The optional-peer workaround is **only** the one-time `npm install --package-lock-only --legacy-peer-deps` resolution; it is not used for installation, dependency validation or the security audit and is not stored in project `.npmrc`. Pinned original browser and MuPDF versions are untouched. This does **not** satisfy any human, device or release approvals.

## Full CI regression root cause and narrow repair
[Exact-head CI run #42034810481](https://github.com/thiepn/pdf/actions/runs/42034810481) reached 719 unit cases (717 passed / 1 failed / 1 skipped) after passing Phase 11, npm lock audit and the security-lock checks. The only failing unit, `tests/unit/releasePublication.test.ts`, compared the newly verified secure `vitest 4.1.12` against an obsolete exact literal `4.1.11`. This branch updates **only** that historical reviewed security-version expectation to the actual qualified patch and also asserts `vite 8.1.6` and `undici 7.30.1`; the mandatory moderate audit and release governance assertions remain unchanged.
PDF-03 exact-head run #42034810494 separately passed 28/28 units and 18/18 native Chromium/Firefox/WebKit zero-retry browser checks including MuPDF independent reopened four-image/two-SMask PDF. Full repository CI must be rerun at the new exact HEAD; previous full CI failure must not be called green.

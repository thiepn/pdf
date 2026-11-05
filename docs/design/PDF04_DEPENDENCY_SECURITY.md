# PDF-04 — Isolated, audited dependency security repair

Baseline: PDF-03 PR #166 at `cc3f6a2c447b155ea545905133fb3a7fd5cec897`. This separate draft branch changes the two direct exact-version dev dependencies and requires a transitive Undici fix without override; it must not modify D19, PDF-03, P18, PR #164 or main.

Pinned proposed security minima (subject to **real registry audit**, not assumptions): `vite 8.1.5 → 8.1.6`, `vitest 4.1.11 → 4.1.12`, and transitive `undici 7.29.1 → 7.30.1` via the npm 10.9.2 native transitive update (no override). All other direct dependencies remain untouched. Original CI: https://github.com/thiepn/pdf/actions/runs/42012268629, 4 npm findings (2 high, 2 moderate).

Authoritative lockfile procedure: npm 10.9.2 on Node 22.16.0 installs package-lock-only with ignored scripts in a dedicated exact-head GitHub job, verifies lockfile-v3 structure and integrity, executes `npm ci`, `npm audit --audit-level=moderate`, TypeScript and PDF-03 original 28 units, preserves its generated lock as a GitHub artifact and pushes **only** the generated `package-lock.json` to the isolated draft branch if the HEAD lease still matches. No audit disable or manual integrity reconstruction. The automatic commit does not assert full native-browser qualification.

Required continuation: observe generated lock artifact/commit and independently verify GitHub result; trigger a fresh exact-head full CI and PDF-03 Chromium/Firefox/WebKit matrix with the final actual lockfile. Remain release-blocked while D16 main ancestry and all 18 human/device approvals are pending. No release, signing, deploy, merge, publication, tag, or live migration.

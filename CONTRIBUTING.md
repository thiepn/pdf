# Contributing

1. Use Node.js 22 or newer.
2. Run `npm install`.
3. Create a focused branch.
4. Add or update automated tests for every behavioral change.
5. Run `npm run release:check` before opening a pull request.
6. Preserve the local-processing model and do not add document-upload endpoints.
7. Do not log PDF text, passwords, certificates, private keys, or raw document bytes.
8. Document preservation boundaries for every destructive or rasterizing operation.
9. Include project-schema and package-format migrations when persistent data changes.
10. Keep AGPL and third-party licence notices intact.

## GitHub Pages release qualification

Phase 22 requires a committed `package-lock.json`. If the repository does not have one yet, run **Actions → Bootstrap dependency lock**, review/merge the generated PR, then use `npm ci` for all CI and release work. Run `npm run audit:pages` before changing Pages/PWA deployment code.

## v6.0 release freeze

Phase 30 is under feature freeze. On the v6.0.x maintenance line, accepted changes are limited to release-blocking bug fixes, migration/security/privacy fixes, accessibility/compatibility corrections, documentation, and release engineering. Do not add PDF tools, change product architecture, weaken exact-lock/browser gates, or mark a build stable outside the exact current maintenance-version tagged qualification workflow.

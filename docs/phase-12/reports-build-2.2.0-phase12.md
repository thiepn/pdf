# Phase 12 Build Audit — 2.2.0-phase12

## Scope audited

- Unified routing
- Workspace session persistence
- Tab lifecycle
- Settings migration
- Checkpoint storage and restoration
- Preservation contract coverage
- Storage-health integration
- Responsive workspace structure
- Backward compatibility
- Source policy and privacy boundaries

## Passed

- Internal semantic TypeScript audit
- Relative imports
- Application/service-worker/database version synchronization
- Settings schema migration
- Workspace route round trips
- Legacy-link mapping
- Preservation contract classification
- Existing Phase 11 runtime and corpus gates
- Source privacy audit
- CSS delimiter and structure checks
- JSON and workflow parsing

## Correctness fixes during audit

1. Only one insight side panel can be open at once, preventing implicit grid rows and hidden workspace content.
2. Deleted projects now remove workspace sessions, events, and checkpoints.
3. Maintenance detects stale tabs and orphaned workspace records.
4. Legacy document links now generate unified workspace URLs.
5. Project cards no longer expose a dense wall of separate mode buttons.
6. Embedded viewer cross-mode links are hidden because the workspace mode rail owns navigation.
7. Settings migration preserves Phase 10 preferences while adding experience and preservation controls.

## Remaining environment limitation

A genuine dependency install, Vite build, Vitest run, and Playwright browser matrix still require a committed lockfile generated through the official npm registry. Phase 12 must not be described as browser-validated until those workflows pass.

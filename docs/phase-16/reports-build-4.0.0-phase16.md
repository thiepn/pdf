# Build report — 4.0.0-phase16

## Scope

Phase 16 implements the reliability foundation required before deeper native editing work. The release does not claim that all historical PDF modes now edit one mutable byte stream; instead, it gives every derived output an explicit immutable lineage and transaction record and prevents concurrent tabs from modifying the same project state.

## Regression fixes

1. Checkpoint restoration no longer resolves to the current project by identical source checksum.
2. Multi-tab ownership no longer disappears when leaving Viewer mode.
3. Compare no longer compares a missing page against the shorter document's final page.
4. OCR resume no longer mixes cached pages produced by different preprocessing recipes.
5. Preservation validation no longer relies on counts alone.
6. Re-importing the same checkpoint no longer aliases globally keyed editor assets.
7. Failed derived commits clean up partial outputs, and interrupted transaction records are reconciled after ownership recovery.
8. Read-only duplicate viewers no longer persist project viewer state.

## Schema changes

- Project schema: 3
- OCR schema: 2
- Preservation graph: 2
- IndexedDB schema: 13
- New stores: `documentRevisions`, `documentTransactions`

## Remaining release gates

The Phase 11 offline gate and Phase 16 pure runtime regression pass in this build. Unit and E2E TypeScript sources also compile against the repository's dependency stubs. The official dependency build, Vitest execution, Playwright browser matrix, worker/WASM integration, and deployed validation remain mandatory before a stable tag. In this execution environment, lockfile/install generation is blocked because the configured npm mirror returns 404 for `@playwright/test@1.62.0`; an attempt against the public npm registry timed out.

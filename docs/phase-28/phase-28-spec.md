# Phase 28 Specification — Exhaustive Bug Hunt & Data-Loss Audit

## Objective

Freeze feature development and aggressively test whether Local PDF Studio can lose data, corrupt a project, mis-recover interrupted work, trust a damaged backup, or fail unsafely on adversarial PDFs.

## Required invariants

1. **Old valid or new valid, never half-written.** A failed local write must reject and leave either the previous valid state or a cleanup-safe incomplete artifact that is not presented as committed work.
2. **Never delete on uncertainty.** A transient inability to read an existing project's source must not trigger automatic deletion.
3. **Recovery evidence is tab-local.** A clean exit in one tab must not erase another tab's crash/interruption record.
4. **Transaction recovery is one-to-one.** One derived output may satisfy at most one interrupted transaction.
5. **Backups fail closed.** Current project packages must authenticate both binary payload and metadata/header mappings before restore.
6. **Malformed PDFs fail safely.** Parser warnings/errors are acceptable; uncaught process/browser crashes and false-success outputs are not.
7. **Large documents remain progressive.** Large PDFs must not eagerly render every page canvas.

## Audit scope

- Project import/deduplication
- OPFS and IndexedDB write failure paths
- Project package export/import
- Workspace crash heartbeat
- Interrupted transaction reconciliation
- Recovery checkpoints
- Existing Phase 16–27 regression suite
- Baseline Phase 11 external-reader corpus
- New 56-file adversarial corpus
- Large-document browser E2E coverage
- Deterministic same-browser visual smoke coverage

## Non-goals

- New PDF features
- UI redesign (Phase 29)
- Final release freeze/tagging (Phase 30)
- Claiming stable without the exact npm lockfile and real browser matrix

# Phase 28 Data-Loss Audit

## Confirmed defects fixed

### P1 — Duplicate import could delete an existing project

**Failure mode:** checksum deduplication located an existing project, then a transient source-read failure entered a cleanup path that could delete that project.

**Fix:** existing source bytes are re-hashed before reuse. Any read failure or checksum mismatch preserves the existing project and imports the incoming bytes as an independent project instead.

### P1 — Crash heartbeat was shared across tabs

**Failure mode:** a single localStorage heartbeat key represented all workspaces. One tab could overwrite or clean up another tab's recovery evidence.

**Fix:** Phase 28 uses versioned per-session heartbeat keys and prunes only expired/clean records. Clean shutdown removes only the current session record.

### P1 — Interrupted transactions could share one output

**Failure mode:** independent reconciliation of multiple `preparing` transactions could choose the same compatible derived project for more than one transaction.

**Fix:** reconciliation now performs a one-to-one matching pass, newest transaction first, with an explicit used-output set.

### P1 — Backup JSON header was unauthenticated

**Failure mode:** v8 authenticated the concatenated binary payload, but the JSON header containing offsets, manifest data, and state mappings could be modified without changing the payload checksum.

**Fix:** package format v9 adds an independent SHA-256 over a deterministic canonical representation of the header with the metadata checksum field omitted. Payload and header are verified before import writes project state.

### P1 preventive hardening — Existing source corruption could be backed up

**Failure mode:** project backup export trusted the stored source bytes without rechecking the project's recorded SHA-256.

**Fix:** backup creation now rejects if the local source bytes no longer match the manifest checksum.

### P1 preventive hardening — Aborted persistence operations

**Failure mode:** OPFS/IndexedDB failure paths did not consistently expose explicit stream/transaction abort completion to callers.

**Fix:** OPFS source writes explicitly abort failed writable streams; IndexedDB read-write helpers reject on transaction abort.

## Failure-injection coverage

- Per-tab heartbeat interruption/clean shutdown
- Ambiguous interrupted transactions
- Multiple compatible outputs
- IndexedDB abort signaling
- OPFS writable abort path
- Backup payload corruption
- Backup metadata/header corruption
- Large 1,000-page progressive-render browser test
- Same-browser deterministic vector render hash across reload

## Residual risk

The application runs on browser-managed storage. Quota, OS eviction, browser bugs, sudden process termination, and hardware failure cannot be eliminated. The architecture therefore treats `.lpsproject` exports as the durable user-controlled backup boundary and refuses to call browser storage a permanent archive.

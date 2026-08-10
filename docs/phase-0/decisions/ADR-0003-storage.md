# ADR-0003 — Local Storage Split

**Status:** Provisional

## Decision

- OPFS stores large source files, temporary outputs, snapshots and imported binary assets.
- IndexedDB stores manifests, preferences, command metadata and OPFS path references.
- Direct file handles are optional conveniences and cannot be the sole persistence mechanism.
- Every save is temporary-write → validate → manifest switch → cleanup.

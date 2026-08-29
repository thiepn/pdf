# Phase 33 Specification — Local Save Trust & Persistence Reliability

## Goal

Make PDF Studio truthful about local persistence. A user must never be told that editor changes are saved when the browser write actually failed, is still pending, or has not started yet.

P33 does not change PDF transformation behavior. It hardens the local persistence contract around the existing editor state, native edit queue, and project recovery metadata.

## Product invariants

1. **Saved means persisted** — `Local changes saved` appears only after all required local writes for that revision succeed.
2. **No silent write failure** — a failed editor autosave produces a visible recovery message and a retry action.
3. **Current-tab safety** — failure copy states that current edits remain open in the current tab; it does not imply they survived closing or refreshing.
4. **Serialized revisions** — autosave revisions are written in order so an older snapshot cannot overwrite a newer one.
5. **Project recovery last** — editor/native state is written before project recovery metadata is updated.
6. **Exit warning while unresolved** — pending, in-progress, or failed local saves guard browser unload.
7. **Best-effort internal navigation flush** — the latest unresolved snapshot is persisted when the editor unmounts.
8. **Local-first unchanged** — no upload, account, telemetry, or remote persistence path is introduced.

## States

The editor exposes five local-save states:

- `idle` — no persistence attempt has been scheduled yet.
- `pending` — the latest revision is waiting for the debounce window.
- `saving` — the latest revision is being written locally.
- `saved` — all required writes for the latest revision succeeded.
- `error` — at least one required write for the latest revision failed.

A later revision supersedes earlier status reporting. Older queued saves may finish, but they cannot mark a newer revision as saved.

## Failure recovery

Quota/storage-capacity errors receive specific guidance. Interrupted IndexedDB writes receive interruption-specific guidance. Unknown failures receive a conservative generic message. All variants say that current edits remain open in the tab and instruct the user to retry before closing or refreshing.

## Non-goals

- No cloud backup.
- No cross-store IndexedDB transaction migration.
- No PDF export engine changes.
- No persistence schema change.
- No stable-release version bump.
- No replacement of project backups as the durable user-controlled recovery boundary.

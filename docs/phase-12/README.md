# Phase 12 — Unified Product Experience

## Objective

Transform the route-heavy PDF utility suite into one coherent document workspace without discarding the tested local engines, storage, security, OCR, and validation systems.

## Product model

A PDF is opened once as a local project. The project receives a persistent document tab. The user changes modes inside that tab:

- Read
- Edit
- Organize
- Forms & secure
- OCR
- Compress
- Inspect
- Repair
- Professional

Simple mode shows the six common workflows. Advanced mode adds inspection, repair, and professional tools.

## Core systems

### Workspace session

The session stores open tabs, active document, pin state, last mode, recently closed tabs, and panel state in IndexedDB.

### Project timeline

Mode changes and tab lifecycle events are recorded locally per project. The timeline does not contain document text or passwords.

### Checkpoints

A checkpoint stores a complete integrity-protected `.lpsproject` package. Restoring creates a separate project so the current project remains unchanged.

### Preservation contracts

Every mode declares:

- What is preserved
- What changes
- What may be lost
- Whether output requires a separate validated copy

### Compatibility

Legacy links such as `#/editor/:id` remain readable. New links resolve to `#/workspace/:id/editor`.

## Persistence changes

- IndexedDB schema: 9
- Settings schema: 4
- New stores:
  - `workspaceSessions`
  - `workspaceEvents`
  - `workspaceCheckpoints`
- New settings:
  - `experienceMode`
  - `showPreservationWarnings`

## Non-goals

Phase 12 does not replace the PDF engine architecture. Mode-specific engines remain lazy modules over one shared local project. The canonical document graph and preservation-first mutation engine belong to Phase 13.

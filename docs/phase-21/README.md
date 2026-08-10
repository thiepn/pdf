# Phase 21 — Workflow Cohesion & Fail-Safe Operations

Phase 21 hardens the Phase 20 productized workspace around operations that can consume significant CPU, memory, or local storage. It intentionally adds very little surface-area functionality.

## 1. Project operation coordinator

All current heavyweight document workflows enter a project-scoped operation boundary before processing. Only one coordinated operation may run for the same project at a time in the current runtime. Where available, the Web Locks API adds a same-origin cross-context mutex using `local-pdf-studio-operation:<projectId>`.

The coordinator publishes a single snapshot containing label, stage, detail, progress, start time, and whether cancellation is safe. The workspace subscribes once and renders one global operation banner rather than allowing each mode to invent independent global state.

## 2. Navigation safety

While coordinated work is active, switching document modes or closing the current project tab is blocked. Browser close/reload receives a `beforeunload` guard. Forced termination can still happen; Phase 16 transaction reconciliation and the Phase 20 heartbeat are the recovery path after restart.

## 3. Storage budget

Before known local writes, Phase 21 asks `navigator.storage.estimate()` for usage/quota when available. Required bytes include 8% write overhead. A write is blocked when it would consume the retained reserve:

- minimum reserve: **25 MB**;
- otherwise **5% of reported quota**, whichever is larger.

Project-source creation, derived-revision commits, and recovery checkpoints also perform repository-level checks close to the actual write. Partial OPFS/IndexedDB source data is cleaned up when project creation fails.

If the browser does not expose a reliable estimate, the application reports that limitation and proceeds with rollback-protected best effort rather than inventing free-space information.

## 4. Cancellation contract

The operation UI only exposes global cancellation when the worker/client accepts an AbortSignal or otherwise has a safe cancellation path. OCR deliberately remains non-cancellable at the coordinator level because an in-flight Tesseract recognition call is not represented as safely interruptible at arbitrary points; its existing resumable pause semantics remain available.

## 5. Current coordinated entry points

- Unified Edit export/save
- Page Organizer export/save
- Protect/Secure export/save
- Compression/Optimize processing and save
- OCR processing and save
- Toolbox transformations and derived saves
- Compliance processing and save
- Professional transforms and save
- Repair processing and save
- Preservation optimization/imposition and save
- Recovery checkpoint creation

The coordinator is not presented as a public low-level repository API. Future workspace features must explicitly enter the operation boundary before shipping.

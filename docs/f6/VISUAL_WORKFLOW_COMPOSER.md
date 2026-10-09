# F6 — Visual Workflow Composer & Automation Orchestration

## Dependency and scope
F6 is **stacked on F5** (PR #138) because its preflight and executor consume the F5 action registry. F6 is a browser-local visual workflow composer, **not** a server-side scheduler or an AI agent with autonomous permissions. It does not require F1–F4 changes.

## UI
The existing Batch workspace (`#/batch`) now exposes a three-zone visual workflow editor:
1. **Action library:** searchable groups (Document, Pages, Appearance, Export) populated from the ten F5 batch-capable actions.
2. **Sequence canvas:** explicit INPUT PDF → ordered operations → OUTPUT PDF/ZIP topology. Drag to reorder, or use visible keyboard/touch-friendly move controls. Per-step duplication/removal with stable IDs; final ZIP export must remain last.
3. **Inspector:** single selected step, its existing parameter editor, description, and field validation.

The page still saves workflows in IndexedDB with the existing version-3 recipe format. JSON import/export and stale-output fingerprints remain compatible. No background work, network uploads, or original-file mutation.

## Headless-driven preflight
Before any run, `validateWorkflowDraft()` derives F5 requests for every step and applies the same strict command and terminal-order validation as the executor. Users see warnings for metadata deletion, rasterization, legacy native rewrites, page assembly risks, and final ZIP export.

Checkbox consent is mandatory for metadata removal and rasterization. Approval is keyed to the exact output-affecting recipe fingerprint: modifying a risky step invalidates the previous approval.

Workflow import validates commands against the F5 allowlist before accepting recipes. Export and save require a valid workflow. The composer enforces at most **32 steps**, **100 queued PDFs**, and an aggregate **256 MB local input-file budget**. It refuses a combined ZIP of more than 256 MB of source result bytes; individual result downloads remain available.

## Queue orchestration
- Files execute locally and sequentially with each existing worker and progress callbacks.
- On error: **Continue** to other files (default) or **Stop** the queue.
- Existing **Pause after current**, **Cancel current**, and **Resume** controls remain available.
- Run completion exposes a locally generated **JSON execution report** with recipe name, fingerprint, failure policy, timestamps, per-file filename/status/input byte count/output byte count, plus success/failure/cancellation totals.
- Reports deliberately exclude document bytes, passwords, or full text.
- Downloads remain explicit user actions and originate only from validated output files. The original input PDFs remain unchanged.

## Risk and explicit limitations
- F5 metadata removal and rasterization approvals are explicit. Advanced PDF signature/certification preservation is **not** guaranteed by legacy non-F4 actions.
- In-browser orchestration runs only while the page remains open, not in a background scheduler.
- Browser processing is memory-bound. A 100-file count limit and 256 MB aggregate file budget restrict queue size; generated PDF buffers may temporarily use additional RAM.
- Imported JSON is checked before processing; saved local recipes preserve legacy format.
- F6 does not implement AI generation, unattended scheduling, external server automation, or cross-device run synchronization.

## Verification matrix
- Pure workflow ordering, terminal action rules, duplicate IDs, schema validation, risk detection and evidence report unit tests.
- Existing F5 action registry and batch output-fingerprint regression tests.
- Browser workflow editing, risk confirmation, PDF execution/download and JSON report tests.
- Full project CI, performance and operations release policy checks.

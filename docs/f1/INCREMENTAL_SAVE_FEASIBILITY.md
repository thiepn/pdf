# F1 — Preservation and incremental-save feasibility audit

**Decision (2026-10-08): NO-GO for production activation.** Keep existing full-rewrite PDF writers. MuPDF exposes incremental saving, but the app's own editor-export worker records browser hangs with buffer-backed incremental saves. A bounded Node/WASM probe cannot qualify browser behavior, and byte preservation alone does not establish correct signatures or safe deletion.

**Scope:** technical audit, isolated experimental eligibility contract, bounded probe with synthetic fixtures, and non-blocking GitHub evidence. No production editor/export/security behavior changes.

## Verified repository observations

| Source | Finding | Impact |
|---|---|---|
| `src/workers/mupdf.worker.ts` | Calls `canBeSavedIncrementally()` but uses `saveToBuffer("garbage=2,compress=yes")`. | Capability check is diagnostic only. |
| `src/workers/editor-export.worker.ts` | Uses a full save; source comment explicitly warns buffer-backed incremental saves can stall in browser workers. | Cannot safely flip a global incremental flag. |
| `src/workers/native-editor.worker.ts`, `native-table.worker.ts`, `native-vector.worker.ts`, `preservation.worker.ts` | Use full garbage/clean/compress saves. | Need isolated end-to-end fidelity qualification before changes. |
| `src/workers/native-image.worker.ts` | Garbage collection removes discarded and redacted image objects. | Incremental saving could leave sensitive prior image bytes recoverable. |
| `src/workers/native-complex.worker.ts` | Uses full `compress=yes,encrypt=keep` output. | Potential candidate only after nested-XObject and replay tests. |
| `src/workers/security.worker.ts` | Redacts, sanitizes, changes protection and performs full saves with garbage collection. | **Must remain full rewrite** for permanent removal. |
| `src/workers/processing.worker.ts`, `toolbox.worker.ts`, `professional.worker.ts`, `compliance.worker.ts` | Produce rewritten/optimized outputs. | No universal incremental default. |
| `src/fidelity/pdfFidelity.ts` | Validates selected semantic structures, with warnings for normalized incremental history. | Does not check the original byte prefix, signatures or secure removal. |
| `src/editor/editorExportClient.ts` | Mixed exports first compile overlays and then replay native edits. | Both stages, not only one writer, need qualification. |

PDFCraft's [incremental writer](https://github.com/storytold/pdfcraft/blob/main/crates/cos/src/writer.rs) is useful as an architectural reference, not a dependency recommendation. PDF Studio already uses MuPDF 1.28. Its documented [JS API](https://mupdf.readthedocs.io/en/latest/reference/javascript/types/PDFDocument.html) exposes `canBeSavedIncrementally()` and `saveToBuffer("incremental")`. The [write options](https://mupdf.readthedocs.io/en/latest/reference/common/pdf-write-options.html) document incremental mode separately from garbage collection. MuPDF itself says repair and redaction may prevent incremental saves.

## Safety policy

1. **Future candidates only:** simple comments/annotations, metadata changes, and ordinary form-value updates. Require positive MuPDF eligibility, successful browser-worker qualification, no repair, no signed fields and no encryption.
2. **Never incremental:** permanent redaction, sanitization, hidden-data removal, security changes, source-content deletion, repair, optimization, merge/split/extraction, rasterization, or any unknown operation.
3. **Signed files:** preserving earlier bytes does not guarantee validity of a PDF digital signature. Require independent checks of `/ByteRange`, certification constraints and subsequent revisions; keep signed files excluded until validated.
4. **Privacy:** an incremental revision retains earlier bytes, potentially including text/images that are no longer visible. Never describe it as a secure-delete mechanism.
5. **Application history:** OPFS/IndexedDB checkpoints are not PDF-native incremental revisions, and must remain separately protected.

The `scripts/f1/incremental-save-contract.mjs` policy is **experimental and not used by production exports**. It fails closed by default, including when a caller forgets the browser qualification flag.

## Reproducible experiment

From a fresh checkout on the qualified Node 22.16.0 toolchain:

```bash
node --test scripts/f1/incremental-save-contract.test.mjs
npm ci --no-audit --no-fund
node --experimental-strip-types scripts/f1/incremental-save-probe.mjs
```

The probe uses `src/fixtures/minimalPdf.ts` (synthetic content only) and runs separate metadata and annotation edits in subprocesses with a hard **12-second** limit each. The result passes only if the input is eligible/unrepaired; the save completes; the output is strictly longer with an **exact unchanged prefix**; the output reopens without repair; MuPDF reports one more version; and the intended modification survives.

These are necessary checks, **not a production readiness certificate**. The F1 GitHub workflow records experiment results but deliberately does not gate or change the existing release path.

## Qualification matrix

| Case | Node/WASM | Browser Worker / external reader |
|---|---|---|
| Metadata edit, annotation edit | Bounded optional probe supplied | **Unqualified**: Chrome, Firefox, WebKit and independent readers |
| Simple AcroForm value change | Pending | Pending |
| Existing incremental history, object streams / xref streams | Pending | Pending, `qpdf --check` and version chain |
| Malformed/repaired PDF | Explicitly denied by policy | Full-rewrite + repair test |
| Encrypted PDF | Explicitly denied by policy | Credential and permission tests |
| Signed PDF | Explicitly denied by policy | `pdfsig`/OpenSSL and certification permission tests |
| Redaction, sanitization, permanent deletion | **Never incremental** | Forensic absence of removed data after full rewrite |
| Large PDFs / memory pressure / cancellation | Pending | Bounded memory, worker termination and recovery |

## Decision / handoff

**F1 audit implementation:** repository inventory, no-go decision, executable fail-closed policy, tests, isolated WASM experiment and evidence workflow.

**Not implemented:** incremental save routing in shipping workers, browser-worker validation, signature-preservation claims, or universal support.

To reopen the decision, first build a dedicated browser-worker harness (including stall detection), run adversarial and existing P8 compatibility fixtures, independently reopen the output in multiple engines, verify security and signatures separately, and compare output fidelity and performance. Adopt incremental output only for specifically qualified non-destructive operations. F2 Form Designer can proceed independently.

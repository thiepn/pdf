# Phase 35 Specification — Compare Responsiveness & Memory Safety

## Goal

Make Compare safe for large or unusual PDFs without changing its local-first comparison model. Visual pixel differencing must not monopolize the main thread or allocate unbounded full-page intermediate canvases, and full-document alignment must be cancellable.

## Invariants

1. **Pixel diff runs off the main thread** — the RGBA comparison loop executes in a dedicated module worker.
2. **Visual work is bounded before rendering** — a shared scale limits the comparison plane by both total pixels and maximum edge length while preserving the same scale for both documents.
3. **No padded source copies** — the worker compares differently sized planes against implicit white page area instead of creating two additional full-size normalized canvases.
4. **Cancellation is real** — visual rendering, worker diff, and document fingerprint analysis observe one AbortSignal and expose a Cancel comparison action.
5. **Long alignment yields** — full-document fingerprinting periodically returns control to the browser so cancellation and input remain responsive.
6. **Results are not stale** — replacing a source or changing comparison mode clears prior output; cancelled work cannot publish a late result.
7. **Canvas memory is released** — replaced or abandoned canvases are explicitly shrunk before removal.
8. **Truthful fidelity boundary** — when a large visual pair is downsampled, the UI states that the comparison was sampled to protect browser memory.
9. **Local privacy unchanged** — comparison inputs and pixels remain in the browser and worker; no network path is added.

## Resource boundaries

The default visual diff plane is capped at 2,000,000 pixels and a 4,096-pixel maximum edge. Scanned-page fingerprints use a smaller 250,000-pixel / 2,048-edge ceiling in addition to their normal low-resolution fingerprint scale.

These limits protect responsiveness and memory. They do not claim forensic pixel-perfect comparison for arbitrarily large engineering drawings or poster-sized pages.

## Non-goals

- No cloud comparison service.
- No OCR engine replacement.
- No semantic document-diff redesign.
- No report/export format in this phase.
- No claim that downsampled visual comparison detects every sub-pixel or print-production change.

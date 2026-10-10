# F11 — Real browser exports and independent PDF reader qualification

## Scope

F11 is stacked exclusively on qualified F10 PR #154 at commit
\`38f8af2f5b3461077e87e4ab025fe1223123861b\`.

The dedicated workflow drives the same actual PDF Studio interface separately
in Chromium, Firefox and WebKit. Each browser must produce and download:
- two editor rectangle PDFs preserving real AcroForm fields, comments and a
  measurement dictionary from the F10 synthetic corpus;
- an actual consumer optimization PDF;
- two PDFs exported by the F6 batch workflow;
- new F11 real rectangle edits on a rotated CropBox and a nonzero page origin.

All 21 downloaded PDFs undergo qpdf structural checks and independent pypdf
and Poppler semantic/text validation. Poppler and MuPDF independently render the
first page of every output. Their page extents and nonblank appearance
occupancy are compared conservatively; this is *not* a pixel-perfect golden
or replacement for human visual signoff. Browser rectangle placements are
compared in normalized PDF crop coordinates and must remain within their
specified geometry drift limit.

Additional browser journeys cover password-protected PDF unlock, local/session
storage privacy, subsequent project loading and malformed-input recovery.
The negative validator contract rejects missing files/readers, mismatched source
annotations, missing new rendered /Square, dropped fields and unsupported
browser identities. Reports and rendered outputs are uploaded even on failure.

## Independence and provenance

Fixtures come only from deterministic Phase 11, P8 and F10 generators.
The report describes actual Playwright downloads, not original fixtures as
exports. The browser source code and validation tools are checked out at
the same commit; GitHub's workflow run ID and artifact ID must be recorded
alongside the reviewed source SHA. Retried or stale artifacts never certify a
new head.

## Excluded real-world acceptance

No synthetic or hosted browser run proves physical Android/iOS behavior,
Adobe Reader equivalence, print-device acceptance, actual NVDA/VoiceOver
accessibility or human approval. F8B Account SSO, original-origin migration,
encrypted backup recovery, and the independent D-series release/fidelity
obligations remain OPEN unless separately substantiated.

No merge, deployment, credential access, golden updates or release activation
is authorized by automated F11 results.

## F12

The next phase is Human Acceptance and Release Evidence Reconciliation:
source-bound evidence inventory, revoked/missing evidence handling, explicit
human acceptance packet, privacy-safe approval collection, release decision
defaulting to DENIED, and controlled rollback/recovery checks.

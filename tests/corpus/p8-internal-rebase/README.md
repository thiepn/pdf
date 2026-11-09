# P8 controlled internal-link reference rebasing

These are **new test-only QA fixtures**, not historical certification evidence.

`source.pdf` derives from the repository's `tests/corpus/generated/plain-text.pdf`, with its first-page URL link replaced using MuPDF by a `/GoTo /Fit` link to page 2. The original page geometry and page content are retained.

`rewritten.pdf` is an actual pypdf rewrite. A temporary blank page was inserted before appending the three source pages, then removed, and original PDF Info metadata was copied. The destination still opens logical page 2, but the referenced indirect PDF object changed:

- Source: `12 0 R` -> page 2
- Rewritten: `13 0 R` -> page 2

P8 must allow this semantic equivalence while still refusing any change to the destination page or view operation.

SHA-256:
- `source.pdf`: `cbb846615752dca079282a55c94fe3a356bd7013795a78fd056a3cdec0e94b09`
- `rewritten.pdf`: `be8f54204f242100498c4f3ec596aeceef947929e5164629506ac333f3b557d0`

These fixtures do not qualify named destinations, chained `/Next` actions, certificate trust, or signature-preserving editing.

# P2 — Intelligent Document Entry

## Objective

Make PDF Studio feel smaller and more obvious when a document opens.

P2 does not add another dashboard, assistant, chat surface, or top-level mode. It uses local document evidence to suggest the most relevant **2–4 existing tasks** for the current PDF.

Examples:

- image-heavy scan → **Make this scan searchable**, **Compress this scan**
- interactive form → **Fill form fields**, **Add a visual signature** when signature fields exist, **Flatten when finished**
- very large PDF → **Reduce file size**, **Inspect file size**
- signed PDF → **Review signatures**, **Edit a copy** with an explicit signature-validity warning
- active/embedded content → **Clean risky content**, **Inspect document structure**
- repaired/malformed PDF → **Repair this PDF**, **Inspect what was repaired**

## Product principles

1. **Deterministic, not AI-generated.** Recommendations come from explicit local PDF evidence and fixed ranking rules.
2. **No new feature silo.** Every recommendation launches an existing task from the canonical task catalog.
3. **Progressive evidence.** The project manifest produces immediate suggestions; deeper inspection refines them later.
4. **Never block opening.** Recommendation inspection is optional guidance. Failure keeps the immediate manifest recommendations and never turns into a workspace error.
5. **Bounded automatic work.** Structural classification samples at most 12 pages spread across the document rather than automatically running the full Inspector pass.
6. **Local only.** No PDF bytes, extracted text, metadata, or recommendation evidence leave the browser.
7. **Preservation-aware.** Signed PDFs never get a silent “edit” suggestion; editing is presented as editing a copy with a signature-validity warning.

## Evidence model

Immediate manifest evidence:

- page count
- byte length
- encryption
- form widget count
- annotation count when available
- attachment count
- JavaScript flag
- descriptive metadata count

Bounded PDF.js structure sample:

- sampled page numbers
- selectable text characters
- image paint operations
- pages with meaningful text
- pages containing images
- scan/image-heavy classification

Security inspection:

- fillable form count
- signature fields
- signature objects and signed signatures
- revision count
- repaired structure
- JavaScript
- open/additional actions
- attachments
- security warnings

## Performance contract

Automatic structure inspection is capped at 12 evenly distributed pages. Small documents inspect every page.

Workspace behavior:

- manifest recommendations appear immediately
- deeper inspection starts after a 650 ms defer so initial document rendering wins
- optional inspection has a 15-second deadline
- full security inspection runs automatically for documents up to 60 pages, or when the manifest already shows forms, encryption, attachments, or JavaScript
- large ordinary PDFs therefore avoid a hidden all-page security scan
- completed evidence is retained even if another inspection source times out
- unmount/project change aborts the inspection
- recommendation inspection never creates a workspace error banner

## Ranking behavior

High-signal evidence outranks generic tasks:

- structural repair
- signatures
- risky/embedded active content
- fillable forms
- signature fields
- likely scans
- very large files
- annotations
- encryption
- very long documents
- metadata

Ordinary PDFs still receive at least two useful actions such as **Edit this PDF** and **Read PDF**. Low-priority metadata alone cannot crowd those out.

Recommendation sets are:

- unique
- backed by real task-catalog entries
- minimum 2
- maximum 4

## UI integration

The same recommendation set is reused in two places:

1. a compact entry strip in Read/Edit workspace modes
2. the existing **Document actions** dialog

The strip can be dismissed for the current workspace session. It does not create a new navigation layer.

The UI explicitly states:

> Suggestions come from local PDF structure only. Nothing is uploaded and no AI model reads the document.

## Safety edge cases

- read-only/non-fillable form widgets may suggest flattening but do not claim to be fillable
- visual signature recommendations explicitly state that they are appearance-only, not certificate-backed signing
- existing signatures show a warning that changed PDF bytes are not covered by the original signature
- encrypted PDFs can suggest protection review/unlock without claiming the source password is stored
- scan detection requires image-heavy pages plus little selectable text, avoiding OCR recommendations for ordinary digital PDFs with decorative images
- malformed/repaired evidence prioritizes repair before ordinary editing

## Automated acceptance

P2 unit coverage verifies:

- scan recommendations
- interactive form recommendations
- large-file recommendations
- signature-preservation recommendations
- risky-content recommendations
- repair recommendations
- ordinary-document fallback quality
- unique 2–4 task output
- bounded page sampling
- soft-failure workspace integration
- local-only recommendation boundary

Physical human/device usability testing remains deferred until the broader implementation roadmap is complete.

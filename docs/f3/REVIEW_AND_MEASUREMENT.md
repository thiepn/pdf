# F3 — Review threads and calibrated measurements

Scope: Add professional review affordances **inside the existing editor**, preserving its page canvas, selectable objects, persisted draft state, undo/redo, full-save PDF export and P8 fidelity checks. This is a separate PR based on `main`; F1 and F2 remain open upstream.

## User workflow

1. Open a PDF and select **Comment**. Draw/place a note on the page. Select the note for its author, subject, contents, color and threaded reply controls.
2. Write replies to the note. Choose Open, In progress or Resolved. Filter the sidebar by review status, see reply counts and jump to a thread. Editing/replies/status updates use the editor history and local save.
3. Select **Measure distance** or **Measure area** from the toolbar. Draw across the source page, reposition/resize if needed.
4. Inspect the measurement panel. By default the PDF uses 72 points/inch (25.4/72 mm per point). Switch between mm, cm or m. **Calibrate to a known real-world length**: the diagonal for distance and the rectangle width for area. Each measurement stores its own scale.
5. Download PDF. Comments become real Text annotations. Replies become linked Text annotations with `/IRT` (in-reply-to) and `/RT /R` (reply), retaining individual author/time. Resolved notes use standard `/StateModel (Review)` and `/State (Completed)`. Measurements become real Line or Polygon annotation types with `/Measure << /Type /Measure /Subtype /RL /R /X /D /A >>` and dimension intents.

## Explicit boundaries

- Measurement geometry: **straight diagonal distance** and **rectangular area** only. This release does not calculate arbitrary polygon areas, multi-segment polylines, curved distances, Perimeter or vector snapping. These are follow-up features, not claims for F3.
- Measurement calibration applies to one measurement object, not all pages. Scaling/rotation of source drawings cannot be inferred and the original document might have been resized. Values must be confirmed against a known length.
- The in-progress status is part of the editable PDF Studio project. Resolved status is embedded with PDF's Review/Completed state. General PDF viewers vary in how they surface threaded annotations and dimension dictionaries.
- Review comments **are annotations** and are not real-time collaborative multi-user threads. Reply attachments, mentions, notifications and threaded import from arbitrary source PDFs are not included.
- Existing source comments and all user content remain intact; this phase appends new annotations on a full rewrite and does not mutate the source PDF.
- This phase does not activate the F1 incremental save experiment, alter F2 form authoring, or change security/redaction/export policy.
- Existing advanced source-PDF annotations are not yet editable as native threads; this tool is for comments created inside the editor.

## Qualification matrix

- [x] Dedicated TS checks, Vitest and build workflow added.
- [ ] Real MuPDF PDF round trip: parent Text note + reply `/IRT` and `/RT` + Line/Polygon `/Measure`.
- [ ] Full repository CI and P8 annotation-count fidelity.
- [ ] Real browser authoring/export/undo/reopen test.
- [ ] External validation in Adobe Acrobat, Chrome and Firefox for measurement scale and threaded comment UX.
- [ ] Independent signed/encrypted PDF regression and native round trip.

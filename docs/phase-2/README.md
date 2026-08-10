# Phase 2 — Page organizer and Quick Tools

Phase 2 introduces the first document-changing production workflows.

Implemented in build 0.5.0:

- Shared Quick Tools route and local-processing workflow
- Multi-file PDF merge
- Project page organizer
- Stable virtual page plan
- Page selection expressions
- Reorder by drag and drop
- Rotate, duplicate, delete, reverse, extract
- Undo and redo for page-plan mutations
- Worker-based PDF compilation with MuPDF page grafting
- Independent PDF.js reopen and page-count validation
- Download or save output as a new local project

Known preservation limitation:

The current compiler rebuilds the output page tree. Page appearance, resources, and page annotations are targeted for preservation, but document-level outlines, attachments, cryptographic signatures, and complex AcroForm relationships are not yet guaranteed. The interface displays this before the result is accepted.

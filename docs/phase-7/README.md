# Phase 7 — Professional Editing and Document Engineering

Phase 7 adds professional workflows that operate on existing document content or prepare print and archival output. These workflows remain separate from the ordinary visual editor because they have stronger preservation, validation, and user-warning requirements.

## Stable implementation targets

- Redact-and-replace existing text lines
- Region-based image replacement
- Bates numbering
- Layer visibility control
- Archival-readiness inspection
- N-up and booklet imposition
- Text-focused DOCX extraction

## Experimental or deferred targets

- Universal direct content-stream rewriting
- Paragraph reflow
- Complex-script static replacement without user fonts
- Exact-layout DOCX reconstruction
- Certified PDF/A conversion
- Browser cryptographic signing
- Full layer flattening without rasterization

All professional PDF outputs are written as new files and reopened through PDF.js before release.

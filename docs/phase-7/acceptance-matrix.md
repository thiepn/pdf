# Phase 7 Acceptance Matrix

| Capability | Implemented | Validation | Current status |
|---|---:|---|---|
| Professional route and navigation | Yes | Route encode/decode runtime test | Pass in source audit |
| Existing text inspection | Yes | StructuredText JSON schema and source review | Requires PDF corpus |
| Redact-and-replace | Yes | Page-space redaction, reopen, replacement presence, original-count reduction | Implemented |
| Overlay replacement | Yes | Output reopen and replacement presence | Implemented |
| Static image-region replacement | Yes | Image XObject embedding and output reopen | Requires visual corpus |
| Page-local resource preservation | Yes | Inherited-resource copy review | Requires complex resource corpus |
| Bates numbering | Yes | Reopen, page count, expected first-label extraction | Implemented |
| Bates exclusion ranges | Yes | Shared parser runtime test | Pass |
| Page labels | Partial | All-pages natural-order gate | Implemented with limitation |
| 2-up and 4-up | Yes | Generated PDF reopen path | Raster boundary documented |
| Booklet order | Yes | Runtime-tested six-page padded order | Pass |
| Layer inspection | Yes | Official MuPDF layer APIs | Requires external readers |
| Layer visibility export | Yes | Output reopen path | Requires external readers |
| Archival readiness | Yes | Structured findings | Not certified conformance |
| Text DOCX export | Yes | ZIP, package parts, XML and escaping | Pass structurally; requires Word testing |
| Encrypted source handling | Yes | Password-aware validation and project import | Implemented; browser test pending |
| Direct universal text rewrite | No | Explicitly classified | Deferred |
| Paragraph reflow | No | No fake control | Deferred |
| Browser certificate signing | No | Explicit limitation | Deferred |

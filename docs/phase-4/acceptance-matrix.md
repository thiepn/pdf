# Phase 4 Acceptance Matrix

| Area | Acceptance requirement | Current status |
|---|---|---|
| Secure route | Existing projects open in a dedicated Secure workspace | Implemented |
| Inspection | Encryption, permissions, forms, signatures, actions, attachments, annotations, metadata, revisions, and repair state are reported | Implemented; corpus expansion required |
| Form filling | Existing writable text, checkbox/radio, combo, and list widgets persist after export | Implemented; external-reader corpus required |
| Form safety | PDF JavaScript is disabled and password-field values are not persisted | Implemented |
| Form flattening | Requested forms become static appearances and no interactive widgets remain | Implemented; external-reader validation required |
| Visual signatures | Appearance marks can be placed and are never described as cryptographic proof | Implemented |
| Digital signatures | Existing fields are detected and signed documents warn about invalidation | Structural detection implemented; cryptographic verification deferred |
| Redaction gating | Editor and source redaction marks are both recognized | Implemented |
| Permanent redaction | Marks are applied, removed from output, and saved with cleanup | Implemented; adversarial corpus required |
| Text verification | Captured marked text is absent from output extraction | Implemented |
| Image/vector redaction | Configurable image and line-art modes are passed to MuPDF | Implemented; render/object corpus required |
| Sanitization | Selected metadata, JS/actions, attachments, links, comments, values, and history are removed | Implemented; unusual-structure corpus required |
| Encryption | Keep/remove/AES-256 output modes and permission masks are supported | Implemented; external-reader testing required |
| Password privacy | Passwords never enter IndexedDB, OPFS, packages, URLs, or diagnostics | Implemented in source and package tests |
| Output validation | Failed required checks block download/project creation | Implemented |
| Recovery | Non-secret security settings recover with the project | Implemented |
| Project backup | Format v3 round-trips security settings and strips passwords | Implemented and runtime-tested |
| Browser regression | Chromium, Firefox, and WebKit workflows pass | CI configured; not executed locally |
| External readers | Outputs validated in major independent readers | Open |

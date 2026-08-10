# Phase 9 Acceptance Matrix

| Area | Requirement | Implementation status |
|---|---|---|
| Runtime gate | Execute inside deployed browser | Implemented |
| PDF.js | Open fixture and extract expected text | Implemented |
| MuPDF | Worker open and clean-save fixture | Implemented |
| Workers | Module-worker handshake | Implemented |
| Coordinates | Four-rotation round trip | Implemented |
| IndexedDB | Write, read, and delete temporary record | Implemented |
| OPFS | Write, read, and delete temporary file | Implemented with warning fallback |
| Cache API | Write, read, and delete temporary response | Implemented |
| Project backups | Verify v5 integrity and reject corruption | Implemented |
| Service worker | Ready-state and active-version query | Implemented |
| Privacy | List observed cross-origin resources | Implemented |
| Source audit | Version, imports, JSON, CSP, placeholder, and SW checks | Implemented and locally passed |
| Distribution audit | Required files, size budgets, hashes, development-origin scan | Implemented; requires real build |
| Browser tests | Smoke, privacy, and runtime validation | Implemented; execution pending normal npm environment |
| Deployment | Pages artifact and live smoke test | Implemented; execution pending GitHub |
| Tagged release | Source, dist, and checksum assets | Implemented; execution pending tag |
| Stable publication | All automated and external gates pass | Not yet satisfied |

## Exit decision

Phase 9 source implementation is complete. The production-validation machinery is available, but stable publication is blocked until its own automated workflows and the external corpus complete successfully.

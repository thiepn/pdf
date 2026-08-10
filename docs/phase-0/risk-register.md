# Initial Risk Register

| ID | Risk | Impact | Current mitigation |
|---|---|---|---|
| R01 | PDF.js and MuPDF geometry diverges | Critical | P0-04 is the next core implementation gate |
| R02 | GitHub Pages base paths break workers/WASM | Critical | Base path derived at build time; deployment probe included |
| R03 | Large PDFs duplicate buffers and exhaust memory | Critical | Transferable buffers and worker ownership; benchmark not yet complete |
| R04 | Deleted or redacted content remains recoverable | Critical | Security-critical full-save validation planned before feature exposure |
| R05 | Output looks correct but is structurally damaged | Critical | Basic validator exists; independent reopen validator is next |
| R06 | OPFS differs across browsers | High | IndexedDB/download fallbacks and capability-gated storage |
| R07 | MuPDF objects leak WASM memory | High | Explicit destroy calls in worker prototype |
| R08 | Service-worker updates retain mismatched chunks | High | Versioned cache; update migration tests still required |
| R09 | Digital signing is incomplete in browsers | Medium | Separate feasibility gate; not required for initial release |
| R10 | Direct text editing corrupts unusual fonts | High | Capability classification and redact-and-replace fallback planned |

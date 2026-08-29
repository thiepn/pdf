# Phase 35 Acceptance Matrix

| ID | Requirement | Evidence / Gate |
| --- | --- | --- |
| P35-WORKER-01 | Visual RGBA differencing executes in a worker. | `visualDiffClient` + `compare-diff.worker` + browser visual compare regression. |
| P35-MEM-01 | Pair rendering is bounded before full-resolution canvases are allocated. | `boundedPairScale` unit tests and Compare integration. |
| P35-MEM-02 | Different page sizes do not require two padded full-size source canvases. | `diffRgbaPlanes` implicit-white behavior test. |
| P35-MEM-03 | Replaced/abandoned canvases release backing stores. | Compare lifecycle implementation review. |
| P35-CANCEL-01 | Full-document analysis exposes Cancel and returns to an enabled state. | 1,000-page browser cancellation regression. |
| P35-CANCEL-02 | Rendering and worker operations observe AbortSignal. | Source review plus browser cancellation coverage. |
| P35-RESP-01 | Long fingerprint loops periodically yield to the browser. | `yieldToBrowser` boundary in document analysis. |
| P35-TRUTH-01 | Downsampled visual comparisons disclose the sampling boundary. | Compare UI copy and source review. |
| P35-STALE-01 | Source/mode changes clear old comparison output. | Compare state lifecycle review. |
| P35-PRIV-01 | No comparison data leaves the browser. | Existing privacy regression and worker-only diff path. |

## Merge gate

Merge only after PDF Studio CI/browser regression, consumer performance, and R10 operational-readiness succeed on the final P35 head. P35 must not weaken the P34 Stable Pages deployment policy or the v7 release freeze audits.

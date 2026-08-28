import "./security.worker";

// The MuPDF module performs asynchronous WASM initialization before the
// imported worker installs its message handler. Signal readiness only after
// that initialization and handler registration have completed so callers do
// not transfer their one-shot PDF buffer too early.
self.postMessage({ type: "READY" });

export {};

import "./toolbox.worker";
// Wait for MuPDF's asynchronous WASM initialization and message registration.
self.postMessage({ type: "READY" });
export {};

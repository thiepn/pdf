import { DOMMatrix } from "@napi-rs/canvas";

// PDF.js uses DOMMatrix during module initialization. Browsers provide it;
// jsdom does not, so unit tests install the standards-compatible canvas type.
Object.defineProperty(globalThis, "DOMMatrix", {
  configurable: true,
  writable: true,
  value: DOMMatrix
});

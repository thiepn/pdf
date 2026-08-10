import assert from "node:assert/strict";
import { classifyResponsiveWidth, deriveViewportMetrics } from "../../src/mobile/layoutPolicy.ts";

let checks = 0;
function check(name, fn) {
  fn(); checks += 1; console.log(`PASS ${name}`);
}

check("classifies phone widths", () => assert.equal(classifyResponsiveWidth(390), "phone"));
check("classifies tablet widths", () => assert.equal(classifyResponsiveWidth(834), "tablet"));
check("classifies desktop widths", () => assert.equal(classifyResponsiveWidth(1440), "desktop"));
check("falls back safely for invalid widths", () => assert.equal(classifyResponsiveWidth(0), "desktop"));
check("detects a software keyboard from VisualViewport shrinkage", () => {
  const metrics = deriveViewportMetrics(844, 510, 0);
  assert.equal(metrics.keyboardOpen, true);
  assert.equal(metrics.keyboardInset, 334);
});
check("does not classify browser chrome jitter as a keyboard", () => {
  const metrics = deriveViewportMetrics(844, 790, 0);
  assert.equal(metrics.keyboardOpen, false);
  assert.equal(metrics.keyboardInset, 54);
});
check("accounts for VisualViewport top offset", () => {
  const metrics = deriveViewportMetrics(844, 600, 44);
  assert.equal(metrics.keyboardInset, 200);
});
check("never produces a negative keyboard inset", () => {
  const metrics = deriveViewportMetrics(700, 720, 0);
  assert.equal(metrics.keyboardInset, 0);
});

console.log(`Phase 23 runtime regression: ${checks}/${checks} checks passed.`);

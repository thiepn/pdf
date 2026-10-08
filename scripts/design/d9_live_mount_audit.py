#!/usr/bin/env python3
"""D9 conservative structural audit of actual PDF Studio runtime mounts.

A passing structural audit is NOT production approval. PDF content fidelity,
security and physical-device evidence are separately required by D8.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

MARKERS = {
    "editor_root": ("src/views/EditorPage.tsx", ["data-d3-editor", "editor-app--d3"]),
    "real_canvas_and_native_output": ("src/views/EditorPage.tsx", ["<EditorCanvasPage", "exportEditorPdf", "validatePdfFidelity"]),
    "real_layer_transactions": ("src/views/EditorPage.tsx", ["onToggleLocked", "d4-layer-lock", "commitObject("]),
    "mobile_panel_navigation": ("src/views/EditorPage.tsx", ["d6-live-editor-dock", 'setLeftTab("layers")', "setPropertiesOpen"]),
    "real_keyboard_help": ("src/views/EditorPage.tsx", ["<D7KeyboardHelp", "dataset.modalOpen"]),
    "quick_processor": ("src/views/QuickToolPage.tsx", ["runQuickOperation", "validateQuickOptions", "OutputTrustPanel"]),
    "quick_workflow_and_download": ("src/views/QuickToolPage.tsx", ["data-d5-quick", "d5-live-steps", "download(result.files[0])"]),
    "d7_modal_component": ("src/interaction/d7/D7KeyboardHelp.tsx", ["useModalFocus", 'role="dialog"', "returnFocusRef"]),
}
STYLES = [
    "studio-editor-d3-live.css",
    "studio-layers-d4-live.css",
    "studio-quicktools-d5-live.css",
    "studio-responsive-d6-live.css",
    "studio-polish-d7-live.css",
]

def audit(root: Path) -> dict:
    checks: dict[str, dict] = {}
    for name, (rel, markers) in MARKERS.items():
        p = root / rel
        text = p.read_text(encoding="utf-8") if p.is_file() else ""
        missing = [marker for marker in markers if marker not in text]
        checks[name] = {"status": "passed" if not missing else "failed", "file": rel, "missing": missing}
    product = root / "src/product/product.css"
    imports = product.read_text(encoding="utf-8") if product.is_file() else ""
    for style in STYLES:
        p = root / "src/product" / style
        count = imports.count(f'@import "./{style}";')
        checks[f"style_{style}"] = {"status": "passed" if p.is_file() and count == 1 else "failed",
                                    "file": "src/product/product.css", "missing": [] if p.is_file() and count == 1 else [style]}
    passed = sum(item["status"] == "passed" for item in checks.values())
    ready = passed == len(checks)
    return {
        "result": "LIVE_WIRING_OBSERVED_NOT_RELEASE_QUALIFIED" if ready else "NOT_WIRED",
        "passed": passed, "total": len(checks), "checks": checks,
        "production_release_qualified": False,
        "release_gate": "D8 evidence inventory, P17/P18 and manual tests still required",
        "limitations": "Structural source inspection cannot prove file persistence or exported PDF fidelity",
    }

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--report-only", action="store_true")
    args = p.parse_args()
    report = audit(args.repo.resolve())
    print(json.dumps(report, indent=2))
    if report["result"] == "NOT_WIRED" and not args.report_only:
        raise SystemExit(2)

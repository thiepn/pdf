#!/usr/bin/env python3
"""D8 fail-closed real-app release evidence gate. Report mode never grants approval."""
from __future__ import annotations
import argparse
import json
import subprocess
from pathlib import Path

REQUIRED = ["d3_editor_integrated","d4_selection_history_and_persistence","d5_real_processor_and_verified_download","d6_phone_tablet_runtime","d7_keyboard_focus_and_status","typecheck_and_verified_build","chromium_real_app","firefox_real_app","webkit_real_app","pdf_export_reopen_and_fidelity","p17_native_fidelity_qualified","p18_device_reader_qualified","security_privacy_review","dark_light_forced_colors_review","keyboard_screen_reader_review","physical_phone_tablet_review","zero_release_blockers","rollback_and_deploy_approval"]
ALLOWED_SOURCES = {"repo_ci", "release_record", "manual_audit", "real_device", "live_repository"}
SOURCE_CHECKS = {
    "src/views/EditorPage.tsx": ["data-d3-editor", "d4-layer-lock", "d6-live-editor-dock", "D7KeyboardHelp"],
    "src/views/QuickToolPage.tsx": ["data-d5-quick", "d5-live-steps"],
    "src/product/product.css": [
        "studio-editor-d3-live.css", "studio-layers-d4-live.css",
        "studio-quicktools-d5-live.css", "studio-responsive-d6-live.css",
        "studio-polish-d7-live.css"
    ]
}

def git(root: Path, *args: str) -> str:
    p = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip() or "git failed")
    return p.stdout.strip()

def evaluate(evidence: dict, root: Path | None) -> dict:
    blockers = []
    if evidence.get("schema_version") != 2 or evidence.get("repository") != "thiepn/pdf":
        blockers.append("evidence schema/repository mismatch")
    records = evidence.get("requirements", {})
    if not isinstance(records, dict) or set(records) != set(REQUIRED):
        blockers.append("requirement set incomplete or altered")
        records = records if isinstance(records, dict) else {}
    passed = 0
    for name in REQUIRED:
        row = records.get(name, {})
        if not isinstance(row, dict) or row.get("status") != "passed" or row.get("source") not in ALLOWED_SOURCES or len(str(row.get("reference", "")).strip()) < 12 or len(str(row.get("reviewed_by", "")).strip()) < 3:
            blockers.append(name)
        else:
            passed += 1
    if root is None:
        blockers.append("live checkout not supplied")
    else:
        try:
            root = root.resolve(strict=True)
            head = git(root, "rev-parse", "HEAD")
            if len(str(evidence.get("candidate_sha", ""))) != 40 or evidence.get("candidate_sha") != head:
                blockers.append("candidate SHA does not match checkout")
            if git(root, "status", "--porcelain"):
                blockers.append("checkout has uncommitted changes")
            if evidence.get("target_branch") != "design/d8-live-release-gate":
                blockers.append("wrong integration candidate branch")
            for path, markers in SOURCE_CHECKS.items():
                f = root / path
                data = f.read_text(encoding="utf-8") if f.is_file() else ""
                for marker in markers:
                    if marker not in data:
                        blockers.append(f"missing live runtime marker: {path}: {marker}")
        except (RuntimeError, OSError) as exc:
            blockers.append(f"cannot inspect live checkout: {exc}")
    # A validated inventory allows human review, never automatic publication.
    return {"status": "QUALIFIED_FOR_REVIEW" if not blockers else "NOT_QUALIFIED",
            "passed": passed, "total": len(REQUIRED), "blockers": blockers,
            "release_approved": False, "automatic_deployment_allowed": False}

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--repo", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = json.loads(args.evidence.read_text(encoding="utf-8"))
    report = evaluate(data, args.repo)
    print(json.dumps(report, indent=2))
    return int(args.check and report["status"] != "QUALIFIED_FOR_REVIEW")

if __name__ == "__main__":
    raise SystemExit(main())

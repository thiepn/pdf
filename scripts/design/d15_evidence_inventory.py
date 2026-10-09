#!/usr/bin/env python3
"""Fail-closed D8 acceptance inventory; inventory PASS never means release PASS."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "docs/design/D8_RELEASE_EVIDENCE.template.json"
EXPECTED_REQUIREMENTS = {
    "d3_editor_integrated", "d4_selection_history_and_persistence",
    "d5_real_processor_and_verified_download", "d6_phone_tablet_runtime",
    "d7_keyboard_focus_and_status", "typecheck_and_verified_build",
    "chromium_real_app", "firefox_real_app", "webkit_real_app",
    "pdf_export_reopen_and_fidelity", "p17_native_fidelity_qualified",
    "p18_device_reader_qualified", "security_privacy_review",
    "dark_light_forced_colors_review", "keyboard_screen_reader_review",
    "physical_phone_tablet_review", "zero_release_blockers",
    "rollback_and_deploy_approval",
}


def audit_evidence(document: dict) -> dict:
    problems: list[str] = []
    requirements = document.get("requirements")
    if not isinstance(requirements, dict):
        return {"inventory_valid": False, "release_qualified": False, "pending": 18, "problems": ["Requirements must be a dictionary."]}
    if document.get("schema_version") != 2 or document.get("repository") != "thiepn/pdf":
        problems.append("Unexpected release evidence schema or repository.")
    if set(requirements) != EXPECTED_REQUIREMENTS:
        problems.append("D8 evidence must retain exactly the 18 original requirements.")
    pending = 0
    for key in sorted(EXPECTED_REQUIREMENTS):
        item = requirements.get(key)
        if not isinstance(item, dict):
            problems.append(f"{key}: missing evidence record")
            pending += 1
            continue
        state = item.get("status")
        if state == "pending":
            pending += 1
        elif state == "approved":
            if not all(isinstance(item.get(field), str) and item[field].strip() for field in ("source", "reference", "reviewed_by")):
                problems.append(f"{key}: approved evidence requires source, reference and reviewer")
        else:
            problems.append(f"{key}: unsupported status {state!r}")
        if state == "pending" and any(item.get(field) for field in ("source", "reference", "reviewed_by")):
            problems.append(f"{key}: incomplete evidence contains unapproved review fields")
    qualified = not problems and pending == 0 and bool(document.get("candidate_sha")) and document.get("status") == "QUALIFIED"
    if document.get("status") == "QUALIFIED" and not qualified:
        problems.append("The release is labeled QUALIFIED without all required verified evidence.")
    if pending and document.get("status") != "NOT_QUALIFIED":
        problems.append("Incomplete release evidence must remain NOT_QUALIFIED.")
    return {
        "inventory_valid": not problems,
        "release_qualified": qualified,
        "pending": pending,
        "approved": 18 - pending,
        "problems": problems,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", type=Path, default=TEMPLATE)
    parser.add_argument("--require-qualified", action="store_true",
                        help="Hard release gate; must fail while any review is pending")
    args = parser.parse_args()
    result = audit_evidence(json.loads(args.path.read_text(encoding="utf-8")))
    result["status"] = "QUALIFIED" if result["release_qualified"] else "NOT_QUALIFIED"
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["inventory_valid"] and (not args.require_qualified or result["release_qualified"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())

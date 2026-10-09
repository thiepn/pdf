#!/usr/bin/env python3
"""Fail-closed D8 acceptance inventory; inventory PASS never means release PASS."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.design.d8_live_gate import REQUIRED as D8_REQUIRED, ALLOWED_SOURCES

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "docs/design/D8_RELEASE_EVIDENCE.template.json"
# D8 owns the authoritative set; never duplicate or redefine its 18 gates.
EXPECTED_REQUIREMENTS = set(D8_REQUIRED)


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
        elif state == "passed":
            if item.get("source") not in ALLOWED_SOURCES or len(str(item.get("reference", "")).strip()) < 12 or len(str(item.get("reviewed_by", "")).strip()) < 3:
                problems.append(f"{key}: passed evidence requires a D8-approved source, substantial reference and named reviewer")
        else:
            problems.append(f"{key}: unsupported status {state!r}")
        if state == "pending" and any(item.get(field) for field in ("source", "reference", "reviewed_by")):
            problems.append(f"{key}: incomplete evidence contains unapproved review fields")
    ready = not problems and pending == 0 and isinstance(document.get("candidate_sha"), str) and len(document["candidate_sha"]) == 40
    if document.get("status") not in {"NOT_QUALIFIED", "QUALIFIED_FOR_REVIEW"}:
        problems.append("Evidence status cannot grant release approval.")
    if pending and document.get("status") != "NOT_QUALIFIED":
        problems.append("Incomplete release evidence must remain NOT_QUALIFIED.")
    if document.get("status") == "QUALIFIED_FOR_REVIEW" and not ready:
        problems.append("Cannot qualify incomplete or unbound evidence for review.")
    return {
        "inventory_valid": not problems,
        "ready_for_review": bool(ready and not problems),
        "release_qualified": False,  # D8 never grants publication permission
        "pending": pending,
        "passed": len(EXPECTED_REQUIREMENTS) - pending,
        "problems": problems,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", type=Path, default=TEMPLATE)
    parser.add_argument("--require-qualified", action="store_true",
                        help="Hard release gate; must fail while any review is pending")
    args = parser.parse_args()
    result = audit_evidence(json.loads(args.path.read_text(encoding="utf-8")))
    result["status"] = "QUALIFIED_FOR_REVIEW" if result["ready_for_review"] else "NOT_QUALIFIED"
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["inventory_valid"] and (not args.require_qualified or result["ready_for_review"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())

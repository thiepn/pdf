#!/usr/bin/env python3
"""D16 immutable ancestry, release-scope and D8 evidence preflight.

A preparation PASS is not a release approval. The source evidence template has
18 unreviewed human/device gates and is never promoted automatically.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

from scripts.design.d13_integration_preflight import validate_manifest as validate_d13
from scripts.design.d15_evidence_inventory import audit_evidence

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "docs/design/D16_RELEASE_SCOPE_MANIFEST.json"
D13_MANIFEST = ROOT / "docs/design/D13_INTEGRATION_MANIFEST.json"
FULL_SHA = re.compile(r"^[a-f0-9]{40}$")
STACK = ("D13", "D14", "D15")
BLOCKER_IDS = {
    "P17-MASKED-EXPORT",
    "D15-EXACT-HEAD-CI",
    "D8-HUMAN-APPROVAL",
    "P17-P18-DEVICES",
    "MAIN-DEPLOY-RECONCILIATION",
}


def check_manifest(data: dict) -> list[str]:
    problems: list[str] = []
    if data.get("schema_version") != 1 or data.get("repository") != "thiepn/pdf" or data.get("phase") != "D16":
        problems.append("D16 source manifest schema, project or phase mismatch")
    if data.get("candidate_branch") != "release/d16-reconciliation-and-qualification":
        problems.append("Unexpected D16 review branch")
    if data.get("status") != "REVIEW_BLOCKED" or data.get("release_policy") != "PREPARATION_ONLY_NOT_RELEASE_APPROVAL":
        problems.append("D16 must remain explicitly review-blocked")
    for key in ("release_qualified", "automatic_merge_allowed", "automatic_deployment_allowed"):
        if data.get(key) is not False:
            problems.append(f"{key} must be explicitly false")
    root = data.get("upstream_root", {})
    if not isinstance(root, dict) or root.get("branch") != "feature/p17-deep-native-content-fidelity" or root.get("review_required") is not True or not FULL_SHA.fullmatch(str(root.get("sha", ""))):
        problems.append("Unreviewed P17 foundation must remain pinned")
    main = data.get("observed_main", {})
    if not isinstance(main, dict) or main.get("branch") != "main" or main.get("review_required") is not True or not FULL_SHA.fullmatch(str(main.get("sha", ""))):
        problems.append("Missing pinned production baseline and review")
    stable = data.get("observed_stable_release", {})
    if (not isinstance(stable, dict) or stable.get("tag") != "v7.1.4"
            or stable.get("release_review_required") is not True
            or not FULL_SHA.fullmatch(str(stable.get("commit_sha", "")))
            or not FULL_SHA.fullmatch(str(stable.get("tag_object_sha", "")))):
        problems.append("Pinned annotated Stable v7.1.4 rollback release missing or incomplete")
    compare = main.get("compare_to_d15", {}) if isinstance(main, dict) else {}
    if not isinstance(compare, dict) or compare.get("ahead_by", 0) < 700 or compare.get("changed_files", 0) < 250 or compare.get("behind_by") != 0:
        problems.append("Observed broad P17 + redesign scope must be recorded accurately")
    stack = data.get("dependency_stack")
    if not isinstance(stack, list) or len(stack) != 3:
        problems.append("Exactly three stacked D13/D14/D15 dependencies required")
    else:
        expected_base = "design/d12-visual-qa-css-cleanup"
        for expected, entry in zip(STACK, stack):
            if not isinstance(entry, dict) or entry.get("phase") != expected:
                problems.append(f"Missing ordered {expected} stack entry")
                continue
            if entry.get("base") != expected_base:
                problems.append(f"{expected} parent branch mismatch")
            if entry.get("branch") != f"design/{expected.lower()}-" + {
                "D13": "integration-release-candidate",
                "D14": "native-fidelity-export-reliability",
                "D15": "regression-evidence-closure"
            }[expected]:
                problems.append(f"{expected} branch mismatch")
            if not isinstance(entry.get("pr"), int) or not FULL_SHA.fullmatch(str(entry.get("sha", ""))):
                problems.append(f"{expected} PR or immutable commit SHA missing")
            expected_base = entry.get("branch")
    if data.get("d8_template") != "docs/design/D8_RELEASE_EVIDENCE.template.json" or data.get("d8_original_requirements") != 18 or data.get("d8_approved_at_capture") != 0:
        problems.append("18-item D8 pending evidence inventory must be retained")
    blockers = data.get("known_blockers")
    if not isinstance(blockers, list) or {item.get("id") for item in blockers if isinstance(item, dict)} != BLOCKER_IDS or any(item.get("last_confirmed") not in ("pending", "failure") for item in blockers if isinstance(item, dict)):
        problems.append("All unresolved release blockers must be explicitly recorded")
    return problems


def git(root: Path, *args: str) -> tuple[int, str]:
    try:
        p = subprocess.run(["git", "-C", str(root), *args], text=True, capture_output=True, timeout=30, check=False)
        return p.returncode, p.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return 127, ""


def evaluate(manifest: dict, d13: dict, d8: dict, repo: Path | None = None) -> dict:
    errors = check_manifest(manifest)
    errors.extend(f"D13 inherited integrity: {message}" for message in validate_d13(d13))
    evidence = audit_evidence(d8)
    if not evidence["inventory_valid"] or evidence["pending"] != 18 or evidence["ready_for_review"]:
        errors.append("D8 template must contain exactly 18 unapproved, structurally valid review items")
    ancestry = {}
    observed = manifest.get("observed_main", {})
    if repo is not None:
        main = observed.get("sha", "")
        rc, remote_main = git(repo, "rev-parse", "refs/remotes/origin/main")
        if rc or remote_main != main:
            errors.append("Production main moved or is not fetched; manual reconciliation required")
        stable_release = manifest.get("observed_stable_release", {})
        rc, tag_commit = git(repo, "rev-parse", "refs/tags/v7.1.4^{commit}")
        if rc or tag_commit != stable_release.get("commit_sha"):
            errors.append("Published stable rollback tag moved or is unavailable")
        rc, tag_object = git(repo, "rev-parse", "refs/tags/v7.1.4")
        if rc or tag_object != stable_release.get("tag_object_sha"):
            errors.append("Annotated stable rollback tag object moved or is unavailable")
        for label, sha in (
            ("main", main),
            ("P17-root", manifest.get("upstream_root", {}).get("sha", "")),
            *((item["phase"], item["sha"]) for item in manifest.get("dependency_stack", []) if isinstance(item, dict) and "phase" in item and "sha" in item),
        ):
            rc, _ = git(repo, "merge-base", "--is-ancestor", sha, "HEAD")
            ancestry[label] = rc == 0
            if rc != 0:
                errors.append(f"Unverified stacked ancestor: {label}")
        rc, count = git(repo, "rev-list", "--count", f"{main}..HEAD")
        if rc or not count.isdigit() or int(count) < 731:
            errors.append("Expected large inherited 731+ commit integration scope missing/unavailable")
        rc, diff = git(repo, "diff", "--name-only", f"{main}...HEAD")
        if rc or len([line for line in diff.splitlines() if line]) < 295:
            errors.append("Observed full 295+ file main-to-candidate diff is missing/unavailable")
    return {
        "phase": "D16",
        "preparation": "PASS" if not errors else "FAIL",
        "errors": errors,
        "ancestry_checked": repo is not None,
        "ancestry": ancestry,
        "d8_requirements_pending": evidence["pending"],
        "d8_ready_for_review": evidence["ready_for_review"],
        "fidelity_export_qualified": False,
        "release_status": "NOT_QUALIFIED",
        "release_approved": False,
        "automatic_merge_allowed": False,
        "automatic_deployment_allowed": False,
        "policy": "A preparation PASS never qualifies native export, physical devices, rollback or production promotion"
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--check-ancestors", action="store_true")
    parser.add_argument("--assert-prepared", action="store_true")
    parser.add_argument("--require-release", action="store_true")
    args = parser.parse_args()
    result = evaluate(
        json.loads(args.manifest.read_text(encoding="utf-8")),
        json.loads(D13_MANIFEST.read_text(encoding="utf-8")),
        json.loads((args.repo / "docs/design/D8_RELEASE_EVIDENCE.template.json").read_text(encoding="utf-8")),
        args.repo.resolve() if args.check_ancestors else None
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return int((args.assert_prepared and result["preparation"] != "PASS") or
               (args.require_release and not result["release_approved"]))


if __name__ == "__main__":
    raise SystemExit(main())
